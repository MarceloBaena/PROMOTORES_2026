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

function textFromRow(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function coordinateFromRow(row: Record<string, string>, keys: string[]) {
  const rawValue = textFromRow(row, keys);
  if (!rawValue) {
    return undefined;
  }

  const value = Number(rawValue.replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

async function findDefaultPromoterId(companyId: string, row: Record<string, string>) {
  const promoterCode = textFromRow(row, [
    "promotorCodigo",
    "codigoPromotor",
    "codigo_promotor",
    "promotor_codigo",
    "promotorCode"
  ]);
  const promoterEmail = textFromRow(row, [
    "promotorEmail",
    "emailPromotor",
    "email_promotor",
    "promotor_email"
  ]);
  const promoterName = textFromRow(row, [
    "promotor",
    "promotorResponsavel",
    "promotor_responsavel",
    "defaultPromoter"
  ]);

  if (!promoterCode && !promoterEmail && !promoterName) {
    return undefined;
  }

  const normalizedCode = promoterCode?.replace(/\D/g, "");
  const promoter = await prisma.promoter.findFirst({
    where: {
      companyId,
      OR: [
        ...(normalizedCode ? [{ code: Number(normalizedCode) }] : []),
        ...(promoterEmail ? [{ user: { email: { equals: promoterEmail, mode: Prisma.QueryMode.insensitive } } }] : []),
        ...(promoterName ? [{ user: { name: { contains: promoterName, mode: Prisma.QueryMode.insensitive } } }] : [])
      ]
    },
    select: { id: true }
  });

  return promoter?.id;
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
        defaultPromoter: { include: { user: true } },
        suppliers: {
          include: {
            supplier: {
              select: {
                id: true,
                name: true,
                tradeName: true,
                status: true,
                categories: {
                  where: { category: { status: "ACTIVE" } },
                  select: {
                    category: {
                      select: {
                        id: true,
                        code: true,
                        name: true
                      }
                    }
                  }
                },
                activities: {
                  where: { activity: { status: "ACTIVE" } },
                  select: {
                    activity: {
                      select: {
                        id: true,
                        code: true,
                        name: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
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
        const name = textFromRow(row, ["name", "nome", "cliente", "razaoSocial", "razao_social"]);

        if (!name) {
          throw new Error("Missing client name.");
        }

        const code = textFromRow(row, ["code", "codigo", "cod_cliente"]) || `CSV-${Date.now()}-${index}`;
        const defaultPromoterId = await findDefaultPromoterId(companyId, row);
        const clientData = {
          companyId,
          name,
          tradeName: textFromRow(row, ["tradeName", "nomeFantasia", "nome_fantasia", "fantasia"]),
          document: textFromRow(row, ["document", "documento", "cnpj", "cpf"]),
          representative: textFromRow(row, ["representative", "representante", "vendedor"]),
          address: textFromRow(row, ["address", "endereco", "logradouro"]),
          addressNumber: textFromRow(row, ["addressNumber", "numero", "nro", "num"]),
          district: textFromRow(row, ["district", "bairro"]),
          city: textFromRow(row, ["city", "cidade", "municipio"]),
          state: textFromRow(row, ["state", "uf", "estado"]),
          latitude: coordinateFromRow(row, ["latitude", "lat"]),
          longitude: coordinateFromRow(row, ["longitude", "lng", "lon"]),
          defaultPromoterId,
          status: "ACTIVE" as const
        };

        await prisma.$transaction(async (tx) => {
          const client = await tx.client.upsert({
            where: { companyId_code: { companyId, code } },
            create: {
              code,
              ...clientData
            },
            update: clientData,
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
