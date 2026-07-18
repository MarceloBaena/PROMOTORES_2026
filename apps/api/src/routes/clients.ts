import fs from "node:fs";
import { Router } from "express";
import { parse } from "csv-parse/sync";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";
import { AppError } from "../lib/errors";
import { requireCompanyId, scopedCompanyWhere, assertSameCompany } from "../lib/tenant";
import { memoryUpload } from "../services/uploads";

export const clientsRouter = Router();

const clientSchema = z.object({
  code: z.string().optional(),
  companyId: z.string().uuid().optional(),
  name: z.string().min(2),
  tradeName: z.string().optional(),
  document: z.string().optional(),
  representative: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  address: z.string().optional(),
  addressNumber: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  defaultPromoterId: z.string().uuid().optional()
});

async function generateNextClientCode(companyId: string) {
  const clients = await prisma.client.findMany({
    where: { companyId },
    select: { code: true }
  });

  const lastCode = clients.reduce((highest, client) => {
    if (!client.code || !/^\d+$/.test(client.code)) {
      return highest;
    }

    return Math.max(highest, Number(client.code));
  }, 0);

  return String(lastCode + 1).padStart(4, "0");
}

async function syncClientSuppliers(
  tx: Prisma.TransactionClient,
  clientId: string,
  companyId?: string | null
) {
  await tx.clientSupplier.deleteMany({
    where: { clientId }
  });

  if (!companyId) {
    return;
  }

  const activeSuppliers = await tx.supplier.findMany({
    where: {
      companyId,
      status: "ACTIVE"
    },
    select: { id: true }
  });

  if (activeSuppliers.length === 0) {
    return;
  }

  await tx.clientSupplier.createMany({
    data: activeSuppliers.map((supplier) => ({
      clientId,
      supplierId: supplier.id
    })),
    skipDuplicates: true
  });
}

clientsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const clients = await prisma.client.findMany({
      where: {
        ...scopedCompanyWhere(req),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { tradeName: { contains: q, mode: "insensitive" } },
                { code: { contains: q, mode: "insensitive" } },
                { document: { contains: q, mode: "insensitive" } },
                { representative: { contains: q, mode: "insensitive" } },
                { address: { contains: q, mode: "insensitive" } },
                { district: { contains: q, mode: "insensitive" } },
                { city: { contains: q, mode: "insensitive" } },
                { state: { contains: q, mode: "insensitive" } },
                { company: { name: { contains: q, mode: "insensitive" } } },
                { defaultPromoter: { user: { name: { contains: q, mode: "insensitive" } } } }
              ]
            }
          : {})
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        company: true,
        defaultPromoter: { include: { user: true } }
      }
    });

    res.json({ data: clients });
  })
);

clientsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = clientSchema.parse(req.body);
    const companyId = requireCompanyId(req, input.companyId);

    if (input.defaultPromoterId) {
      const promoter = await prisma.promoter.findUnique({
        where: { id: input.defaultPromoterId },
        select: { companyId: true }
      });
      assertSameCompany(req, promoter?.companyId);

      if (promoter?.companyId !== companyId) {
        throw new AppError(400, "PROMOTER_COMPANY_MISMATCH", "Promotor responsavel pertence a outra empresa/filial.");
      }
    }

    const client = await prisma.$transaction(async (tx) => {
      const createdClient = await tx.client.create({
        data: {
          ...input,
          companyId,
          code: input.code?.trim() || await generateNextClientCode(companyId),
          status: input.status ?? "ACTIVE",
          latitude: input.latitude,
          longitude: input.longitude
        }
      });

      await syncClientSuppliers(tx, createdClient.id, companyId);

      return tx.client.findUniqueOrThrow({
        where: { id: createdClient.id },
        include: {
          company: true,
          defaultPromoter: { include: { user: true } }
        }
      });
    });

    res.status(201).json({ data: client });
  })
);

clientsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = clientSchema.partial().parse(req.body);
    const existing = await prisma.client.findUnique({
      where: { id: req.params.id },
      select: { companyId: true }
    });

    if (!existing) {
      throw new AppError(404, "CLIENT_NOT_FOUND", "Cliente nao encontrado.");
    }

    assertSameCompany(req, existing.companyId);
    const companyId = input.companyId ? requireCompanyId(req, input.companyId) : existing.companyId;

    if (input.defaultPromoterId) {
      const promoter = await prisma.promoter.findUnique({
        where: { id: input.defaultPromoterId },
        select: { companyId: true }
      });

      if (promoter?.companyId !== companyId) {
        throw new AppError(400, "PROMOTER_COMPANY_MISMATCH", "Promotor responsavel pertence a outra empresa/filial.");
      }
    }

    const client = await prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: req.params.id },
        data: {
          ...input,
          companyId
        }
      });

      await syncClientSuppliers(tx, req.params.id, companyId);

      return tx.client.findUniqueOrThrow({
        where: { id: req.params.id },
        include: {
          company: true,
          defaultPromoter: { include: { user: true } }
        }
      });
    });

    res.json({ data: client });
  })
);

clientsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.client.findUnique({
      where: { id: req.params.id },
      select: { companyId: true }
    });

    if (!existing) {
      throw new AppError(404, "CLIENT_NOT_FOUND", "Cliente nao encontrado.");
    }

    assertSameCompany(req, existing.companyId);
    await prisma.client.update({
      where: { id: req.params.id },
      data: { status: "ARCHIVED" }
    });

    res.status(204).send();
  })
);

clientsRouter.post(
  "/import-csv",
  memoryUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError(400, "CSV_FILE_REQUIRED", "CSV file is required.");
    }

    const content = req.file.buffer?.toString("utf8") ?? fs.readFileSync(req.file.path, "utf8");
    const requestedCompanyId = typeof req.body.companyId === "string" ? req.body.companyId : undefined;
    const companyId = requireCompanyId(req, requestedCompanyId);
    const records = parse(content, {
      bom: true,
      columns: true,
      delimiter: [",", ";"],
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true
    }) as Array<Record<string, string>>;

    let importedRows = 0;
    const errors: Array<{ row: number; message: string }> = [];

    for (const [index, row] of records.entries()) {
      try {
        const name = row.name || row.nome || row.cliente;

        if (!name) {
          throw new Error("Missing client name.");
        }

        const code = row.code || row.codigo || `CSV-${Date.now()}-${index}`;

        await prisma.$transaction(async (tx) => {
          const client = await tx.client.upsert({
            where: { companyId_code: { companyId, code } },
            create: {
              companyId,
              code,
              name,
              tradeName: row.tradeName || row.nomeFantasia || row.fantasia || undefined,
              document: row.document || row.documento || undefined,
              representative: row.representative || row.representante || undefined,
              address: row.address || row.endereco || undefined,
              addressNumber: row.addressNumber || row.numero || undefined,
              district: row.district || row.bairro || undefined,
              city: row.city || row.cidade || undefined,
              state: row.state || row.uf || undefined,
              status: "ACTIVE"
            },
            update: {
              companyId,
              name,
              tradeName: row.tradeName || row.nomeFantasia || row.fantasia || undefined,
              document: row.document || row.documento || undefined,
              representative: row.representative || row.representante || undefined,
              address: row.address || row.endereco || undefined,
              addressNumber: row.addressNumber || row.numero || undefined,
              district: row.district || row.bairro || undefined,
              city: row.city || row.cidade || undefined,
              state: row.state || row.uf || undefined,
              status: "ACTIVE"
            },
            select: { id: true }
          });

          await syncClientSuppliers(tx, client.id, companyId);
        });

        importedRows += 1;
      } catch (error) {
        errors.push({
          row: index + 2,
          message: error instanceof Error ? error.message : "Unknown import error."
        });
      }
    }

    const log = await prisma.clientImportLog.create({
      data: {
        fileName: req.file.originalname,
        status: errors.length === 0 ? "SUCCESS" : importedRows > 0 ? "PARTIAL" : "FAILED",
        totalRows: records.length,
        importedRows,
        failedRows: errors.length,
        errors,
        preview: records.slice(0, 5),
        createdById: req.user?.id,
        companyId
      }
    });

    res.status(201).json({ data: log });
  })
);
