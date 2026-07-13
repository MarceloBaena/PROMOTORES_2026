import fs from "node:fs";
import { Router } from "express";
import { parse } from "csv-parse/sync";
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
  defaultPromoterId: z.string().uuid().optional(),
  supplierIds: z.array(z.string().uuid()).optional(),
  activityIds: z.array(z.string().uuid()).optional()
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

const clientInclude = {
  company: true,
  defaultPromoter: { include: { user: true } },
  suppliers: {
    include: {
      supplier: true
    }
  },
  activities: {
    include: {
      activity: true
    }
  }
} as const;

function normalizeClient(client: Record<string, unknown>) {
  const supplierLinks = Array.isArray(client.suppliers) ? client.suppliers : [];
  const activityLinks = Array.isArray(client.activities) ? client.activities : [];

  return {
    ...client,
    suppliers: supplierLinks
      .map((link) => (link as { supplier?: unknown }).supplier)
      .filter(Boolean),
    activities: activityLinks
      .map((link) => (link as { activity?: unknown }).activity)
      .filter(Boolean)
  };
}

async function validateActivityIds(companyId: string, activityIds?: string[]) {
  const uniqueActivityIds = Array.from(new Set(activityIds ?? []));

  if (uniqueActivityIds.length === 0) {
    return [];
  }

  const activities = await prisma.clientActivityType.findMany({
    where: {
      id: { in: uniqueActivityIds },
      companyId
    },
    select: { id: true }
  });

  if (activities.length !== uniqueActivityIds.length) {
    throw new AppError(400, "ACTIVITY_NOT_FOUND", "Uma ou mais atividades nao existem nesta empresa/filial.");
  }

  return uniqueActivityIds;
}

async function resolveActivityIdsFromCsv(companyId: string, rawActivities?: string) {
  const tokens = (rawActivities ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  const activityIds: string[] = [];
  const warnings: string[] = [];

  for (const token of tokens) {
    const numericCode = /^\d+$/.test(token) ? Number(token) : undefined;
    const activity = await prisma.clientActivityType.findFirst({
      where: {
        companyId,
        OR: [
          { id: token },
          { name: { equals: token, mode: "insensitive" } },
          ...(numericCode ? [{ code: numericCode }] : [])
        ]
      },
      select: { id: true }
    });

    if (activity) {
      activityIds.push(activity.id);
    } else {
      warnings.push(`Atividade nao encontrada: ${token}`);
    }
  }

  return {
    activityIds: Array.from(new Set(activityIds)),
    warnings
  };
}

clientsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
    const clients = await prisma.client.findMany({
      where: {
        ...scopedCompanyWhere(req),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { code: { contains: q, mode: "insensitive" } },
                { document: { contains: q, mode: "insensitive" } },
                { representative: { contains: q, mode: "insensitive" } },
                { address: { contains: q, mode: "insensitive" } },
                { district: { contains: q, mode: "insensitive" } },
                { city: { contains: q, mode: "insensitive" } },
                { state: { contains: q, mode: "insensitive" } },
                { company: { name: { contains: q, mode: "insensitive" } } },
                { defaultPromoter: { user: { name: { contains: q, mode: "insensitive" } } } },
                { activities: { some: { activity: { name: { contains: q, mode: "insensitive" } } } } }
              ]
            }
          : {})
      },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: clientInclude
    });

    res.json({ data: clients.map((client) => normalizeClient(client as unknown as Record<string, unknown>)) });
  })
);

clientsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = clientSchema.parse(req.body);
    const companyId = requireCompanyId(req, input.companyId);
    const { supplierIds, activityIds, ...clientInput } = input;
    void supplierIds;

    if (clientInput.defaultPromoterId) {
      const promoter = await prisma.promoter.findUnique({
        where: { id: clientInput.defaultPromoterId },
        select: { companyId: true }
      });
      assertSameCompany(req, promoter?.companyId);

      if (promoter?.companyId !== companyId) {
        throw new AppError(400, "PROMOTER_COMPANY_MISMATCH", "Promotor responsavel pertence a outra empresa/filial.");
      }
    }

    const validActivityIds = await validateActivityIds(companyId, activityIds);

    const client = await prisma.$transaction(async (tx) => {
      const createdClient = await tx.client.create({
        data: {
          ...clientInput,
          companyId,
          code: clientInput.code?.trim() || await generateNextClientCode(companyId),
          status: clientInput.status ?? "ACTIVE",
          latitude: clientInput.latitude,
          longitude: clientInput.longitude
        },
        include: clientInclude
      });

      const activeSupplierIds = (
        await tx.supplier.findMany({
          where: {
            companyId,
            status: "ACTIVE"
          },
          select: { id: true }
        })
      ).map((supplier) => supplier.id);

      if (activeSupplierIds.length > 0) {
        await tx.clientSupplier.createMany({
          data: activeSupplierIds.map((supplierId) => ({
            clientId: createdClient.id,
            supplierId
          })),
          skipDuplicates: true
        });
      }

      if (validActivityIds.length > 0) {
        await tx.clientActivityAssignment.createMany({
          data: validActivityIds.map((activityId) => ({
            clientId: createdClient.id,
            activityId
          })),
          skipDuplicates: true
        });
      }

      return tx.client.findUniqueOrThrow({
        where: { id: createdClient.id },
        include: clientInclude
      });
    });

    res.status(201).json({ data: normalizeClient(client as unknown as Record<string, unknown>) });
  })
);

clientsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = clientSchema.partial().parse(req.body);
    const { supplierIds, activityIds, ...clientInput } = input;
    void supplierIds;
    const existing = await prisma.client.findUnique({
      where: { id: req.params.id },
      select: { companyId: true }
    });

    if (!existing) {
      throw new AppError(404, "CLIENT_NOT_FOUND", "Cliente nao encontrado.");
    }

    assertSameCompany(req, existing.companyId);
    const companyId = clientInput.companyId ? requireCompanyId(req, clientInput.companyId) : existing.companyId;

    if (clientInput.defaultPromoterId) {
      const promoter = await prisma.promoter.findUnique({
        where: { id: clientInput.defaultPromoterId },
        select: { companyId: true }
      });

      if (promoter?.companyId !== companyId) {
        throw new AppError(400, "PROMOTER_COMPANY_MISMATCH", "Promotor responsavel pertence a outra empresa/filial.");
      }
    }

    if (!companyId) {
      throw new AppError(400, "COMPANY_REQUIRED", "Cliente precisa estar vinculado a uma empresa/filial.");
    }

    const validActivityIds = await validateActivityIds(companyId, activityIds);

    const client = await prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: req.params.id },
        data: {
          ...clientInput,
          companyId
        }
      });

      await tx.clientSupplier.deleteMany({ where: { clientId: req.params.id } });

      const activeSupplierIds = (
        await tx.supplier.findMany({
          where: {
            companyId,
            status: "ACTIVE"
          },
          select: { id: true }
        })
      ).map((supplier) => supplier.id);

      if (activeSupplierIds.length > 0) {
        await tx.clientSupplier.createMany({
          data: activeSupplierIds.map((supplierId) => ({
            clientId: req.params.id,
            supplierId
          })),
          skipDuplicates: true
        });
      }

      if (activityIds !== undefined) {
        await tx.clientActivityAssignment.deleteMany({ where: { clientId: req.params.id } });

        if (validActivityIds.length > 0) {
          await tx.clientActivityAssignment.createMany({
            data: validActivityIds.map((activityId) => ({
              clientId: req.params.id,
              activityId
            })),
            skipDuplicates: true
          });
        }
      }

      return tx.client.findUniqueOrThrow({
        where: { id: req.params.id },
        include: clientInclude
      });
    });

    res.json({ data: normalizeClient(client as unknown as Record<string, unknown>) });
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
    const warnings: Array<{ row: number; message: string }> = [];
    const activeSupplierIds = (
      await prisma.supplier.findMany({
        where: {
          companyId,
          status: "ACTIVE"
        },
        select: { id: true }
      })
    ).map((supplier) => supplier.id);

    for (const [index, row] of records.entries()) {
      try {
        const name = row.name || row.nome || row.cliente;

        if (!name) {
          throw new Error("Missing client name.");
        }

        const code = row.code || row.codigo || `CSV-${Date.now()}-${index}`;
        const activityResolution = await resolveActivityIdsFromCsv(companyId, row.activities || row.atividades);

        const client = await prisma.client.upsert({
          where: { companyId_code: { companyId, code } },
          create: {
            companyId,
            code,
            name,
            document: row.document || row.documento || undefined,
            representative: row.representative || row.representante || row.vendedor || undefined,
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
            document: row.document || row.documento || undefined,
            representative: row.representative || row.representante || row.vendedor || undefined,
            address: row.address || row.endereco || undefined,
            addressNumber: row.addressNumber || row.numero || undefined,
            district: row.district || row.bairro || undefined,
            city: row.city || row.cidade || undefined,
            state: row.state || row.uf || undefined,
            status: "ACTIVE"
          }
        });

        await prisma.clientSupplier.deleteMany({
          where: { clientId: client.id }
        });

        if (activeSupplierIds.length > 0) {
          await prisma.clientSupplier.createMany({
            data: activeSupplierIds.map((supplierId) => ({
              clientId: client.id,
              supplierId
            })),
            skipDuplicates: true
          });
        }

        if (activityResolution.activityIds.length > 0) {
          await prisma.clientActivityAssignment.createMany({
            data: activityResolution.activityIds.map((activityId) => ({
              clientId: client.id,
              activityId
            })),
            skipDuplicates: true
          });
        }

        for (const warning of activityResolution.warnings) {
          warnings.push({ row: index + 2, message: warning });
        }

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
        errors: [...errors, ...warnings.map((warning) => ({ ...warning, message: `Aviso: ${warning.message}` }))],
        preview: records.slice(0, 5),
        createdById: req.user?.id,
        companyId
      }
    });

    res.status(201).json({ data: { ...log, warnings } });
  })
);
