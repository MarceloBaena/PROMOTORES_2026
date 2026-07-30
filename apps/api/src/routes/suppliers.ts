import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { asyncHandler } from "../middleware/async-handler";
import { assertSameCompany, requireCompanyId, scopedCompanyWhere } from "../lib/tenant";

export const suppliersRouter = Router();

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const supplierSchema = z.object({
  companyId: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome do fornecedor."),
  tradeName: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
  document: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
  email: z.preprocess(emptyStringToUndefined, z.string().trim().email("Informe um e-mail valido.").optional()),
  phone: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
  contactName: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
  notes: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
  categoryIds: z.array(z.string().uuid()).optional(),
  activityIds: z.array(z.string().uuid()).optional(),
  activityNames: z.array(z.string().trim().min(2, "Informe pelo menos 2 caracteres para a atividade.")).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional()
});

const statusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"])
});

const INTERACTIVE_TRANSACTION_TIMEOUT_MS = 30_000;
const INTERACTIVE_TRANSACTION_MAX_WAIT_MS = 10_000;
const CLIENT_SUPPLIER_BATCH_SIZE = 500;

async function assertUniqueDocument(companyId: string, document?: string, ignoreSupplierId?: string) {
  if (!document) {
    return;
  }

  const existing = await prisma.supplier.findFirst({
    where: {
      companyId,
      document,
      ...(ignoreSupplierId ? { id: { not: ignoreSupplierId } } : {})
    },
    select: { id: true }
  });

  if (existing) {
    throw new AppError(409, "SUPPLIER_DOCUMENT_DUPLICATED", "Ja existe fornecedor com este documento nesta empresa/filial.");
  }
}

async function validateCategoryIds(companyId: string, categoryIds?: string[]) {
  const uniqueCategoryIds = Array.from(new Set(categoryIds ?? []));

  if (uniqueCategoryIds.length === 0) {
    return [];
  }

  const categories = await prisma.productCategory.findMany({
    where: {
      id: { in: uniqueCategoryIds },
      companyId
    },
    select: { id: true }
  });

  if (categories.length !== uniqueCategoryIds.length) {
    throw new AppError(400, "CATEGORY_NOT_FOUND", "Uma ou mais categorias nao existem nesta empresa/filial.");
  }

  return uniqueCategoryIds;
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

async function resolveActivityIds(
  tx: Pick<typeof prisma, "clientActivityType">,
  companyId: string,
  activityIds?: string[],
  activityNames?: string[]
) {
  const validActivityIds = await validateActivityIds(companyId, activityIds);
  const normalizedNames = Array.from(
    new Set(
      (activityNames ?? [])
        .map((name) => name.trim())
        .filter((name) => name.length >= 2)
    )
  );

  if (normalizedNames.length === 0) {
    return validActivityIds;
  }

  const existingActivities = await tx.clientActivityType.findMany({
    where: {
      companyId,
      OR: normalizedNames.map((name) => ({
        name: {
          equals: name,
          mode: "insensitive"
        }
      }))
    },
    select: {
      id: true,
      name: true
    }
  });

  const existingByName = new Map(
    existingActivities.map((activity) => [activity.name.trim().toLowerCase(), activity.id])
  );

  const missingNames = normalizedNames.filter((name) => !existingByName.has(name.toLowerCase()));

  const createdActivities = await Promise.all(
    missingNames.map((name) =>
      tx.clientActivityType.create({
        data: {
          companyId,
          name,
          status: "ACTIVE"
        },
        select: {
          id: true
        }
      })
    )
  );

  return Array.from(new Set([
    ...validActivityIds,
    ...existingActivities.map((activity) => activity.id),
    ...createdActivities.map((activity) => activity.id)
  ]));
}

async function listCompanyClientIds(companyId: string) {
  const clients = await prisma.client.findMany({
    where: { companyId },
    select: { id: true },
    orderBy: { id: "asc" }
  });

  return clients.map((client) => client.id);
}

async function createClientSupplierLinksInBatches(supplierId: string, clientIds: string[]) {
  if (clientIds.length === 0) {
    return;
  }

  for (let start = 0; start < clientIds.length; start += CLIENT_SUPPLIER_BATCH_SIZE) {
    const batch = clientIds.slice(start, start + CLIENT_SUPPLIER_BATCH_SIZE);
    await prisma.clientSupplier.createMany({
      data: batch.map((clientId) => ({
        clientId,
        supplierId
      })),
      skipDuplicates: true
    });
  }
}

async function syncSupplierClientCoverage(supplierId: string, companyId: string, status: "ACTIVE" | "INACTIVE") {
  await prisma.clientSupplier.deleteMany({
    where: { supplierId }
  });

  if (status !== "ACTIVE") {
    return;
  }

  const clientIds = await listCompanyClientIds(companyId);
  await createClientSupplierLinksInBatches(supplierId, clientIds);
}

function assertSupplierCompanyId(companyId: string | null, supplierId: string) {
  if (!companyId) {
    throw new AppError(
      400,
      "SUPPLIER_COMPANY_REQUIRED",
      `Fornecedor ${supplierId} esta sem empresa/filial vinculada.`
    );
  }

  return companyId;
}

function shouldResyncSupplierCoverageOnUpdate(
  previous: { companyId: string | null; status?: "ACTIVE" | "INACTIVE" | null },
  next: { companyId: string | null; status?: "ACTIVE" | "INACTIVE" | null }
) {
  return previous.companyId !== next.companyId || previous.status !== next.status;
}

function supplierInclude() {
  return {
    company: true,
    categories: {
      include: {
        category: true
      }
    },
    activities: {
      include: {
        activity: true
      }
    },
    _count: {
      select: {
        clients: true,
        categories: true,
        activities: true
      }
    }
  } as const;
}

function normalizeSupplier(supplier: Record<string, unknown>) {
  const categoryLinks = Array.isArray(supplier.categories) ? supplier.categories : [];
  const activityLinks = Array.isArray(supplier.activities) ? supplier.activities : [];

  return {
    ...supplier,
    categories: categoryLinks
      .map((link) => (link as { category?: unknown }).category)
      .filter(Boolean),
    activities: activityLinks
      .map((link) => (link as { activity?: unknown }).activity)
      .filter(Boolean)
  };
}

suppliersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const numericCode = /^\d+$/.test(q) ? Number(q) : undefined;
    const status = typeof req.query.status === "string" && ["ACTIVE", "INACTIVE"].includes(req.query.status)
      ? req.query.status as "ACTIVE" | "INACTIVE"
      : undefined;

    const suppliers = await prisma.supplier.findMany({
      where: {
        ...scopedCompanyWhere(req),
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { tradeName: { contains: q, mode: "insensitive" } },
                { document: { contains: q, mode: "insensitive" } },
                { contactName: { contains: q, mode: "insensitive" } },
                { phone: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { categories: { some: { category: { name: { contains: q, mode: "insensitive" } } } } },
                { activities: { some: { activity: { name: { contains: q, mode: "insensitive" } } } } },
                { company: { name: { contains: q, mode: "insensitive" } } },
                ...(numericCode ? [{ company: { code: numericCode } }] : [])
              ]
            }
          : {})
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 80,
      include: supplierInclude()
    });

    res.json({ data: suppliers.map((supplier) => normalizeSupplier(supplier as unknown as Record<string, unknown>)) });
  })
);

suppliersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const supplier = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      include: {
        ...supplierInclude(),
        clients: {
          include: {
            client: true
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!supplier) {
      throw new AppError(404, "SUPPLIER_NOT_FOUND", "Fornecedor nao encontrado.");
    }

    assertSameCompany(req, supplier.companyId);
    res.json({ data: normalizeSupplier(supplier as unknown as Record<string, unknown>) });
  })
);

suppliersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = supplierSchema.parse(req.body);
    const companyId = requireCompanyId(req, input.companyId);
    const { categoryIds, activityIds, activityNames, ...supplierInput } = input;

    await assertUniqueDocument(companyId, supplierInput.document);
    const validCategoryIds = await validateCategoryIds(companyId, categoryIds);

    const supplier = await prisma.$transaction(async (tx) => {
      const resolvedActivityIds = await resolveActivityIds(tx, companyId, activityIds, activityNames);
      const createdSupplier = await tx.supplier.create({
        data: {
          ...supplierInput,
          companyId,
          status: supplierInput.status ?? "ACTIVE"
        },
        include: supplierInclude()
      });

      if (validCategoryIds.length > 0) {
        await tx.supplierProductCategory.createMany({
          data: validCategoryIds.map((categoryId) => ({
            supplierId: createdSupplier.id,
            categoryId
          })),
          skipDuplicates: true
        });
      }

      if (resolvedActivityIds.length > 0) {
        await tx.supplierActivityAssignment.createMany({
          data: resolvedActivityIds.map((activityId) => ({
            supplierId: createdSupplier.id,
            activityId
          })),
          skipDuplicates: true
        });
      }

      return createdSupplier;
    }, {
      timeout: INTERACTIVE_TRANSACTION_TIMEOUT_MS,
      maxWait: INTERACTIVE_TRANSACTION_MAX_WAIT_MS
    });

    await syncSupplierClientCoverage(supplier.id, companyId, supplier.status);

    const hydratedSupplier = await prisma.supplier.findUniqueOrThrow({
      where: { id: supplier.id },
      include: supplierInclude()
    });

    res.status(201).json({ data: normalizeSupplier(hydratedSupplier as unknown as Record<string, unknown>) });
  })
);

suppliersRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = supplierSchema.partial().parse(req.body);
    const { categoryIds, activityIds, activityNames, ...supplierInput } = input;
    const existing = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      select: { id: true, companyId: true, status: true }
    });

    if (!existing) {
      throw new AppError(404, "SUPPLIER_NOT_FOUND", "Fornecedor nao encontrado.");
    }

    assertSameCompany(req, existing.companyId);
    const companyId = input.companyId ? requireCompanyId(req, input.companyId) : existing.companyId;
    const companyChanged = companyId !== existing.companyId;

    if (!companyId) {
      throw new AppError(400, "COMPANY_REQUIRED", "Fornecedor precisa estar vinculado a uma empresa/filial.");
    }

    await assertUniqueDocument(companyId, supplierInput.document, existing.id);
    const validCategoryIds = categoryIds === undefined ? undefined : await validateCategoryIds(companyId, categoryIds);
    const nextCategoryIds = companyChanged ? (validCategoryIds ?? []) : validCategoryIds;

    const supplier = await prisma.$transaction(async (tx) => {
      const resolvedActivityIds = companyChanged || activityIds !== undefined || activityNames !== undefined
        ? await resolveActivityIds(tx, companyId, activityIds, activityNames)
        : undefined;

      await tx.supplier.update({
        where: { id: existing.id },
        data: {
          ...supplierInput,
          companyId
        }
      });

      if (nextCategoryIds !== undefined) {
        await tx.supplierProductCategory.deleteMany({
          where: { supplierId: existing.id }
        });

        if (nextCategoryIds.length > 0) {
          await tx.supplierProductCategory.createMany({
            data: nextCategoryIds.map((categoryId) => ({
              supplierId: existing.id,
              categoryId
            })),
            skipDuplicates: true
          });
        }
      }

      if (resolvedActivityIds !== undefined) {
        await tx.supplierActivityAssignment.deleteMany({
          where: { supplierId: existing.id }
        });

        if (resolvedActivityIds.length > 0) {
          await tx.supplierActivityAssignment.createMany({
            data: resolvedActivityIds.map((activityId) => ({
              supplierId: existing.id,
              activityId
            })),
            skipDuplicates: true
          });
        }
      }

      return tx.supplier.findUniqueOrThrow({
        where: { id: existing.id },
        include: supplierInclude()
      });
    }, {
      timeout: INTERACTIVE_TRANSACTION_TIMEOUT_MS,
      maxWait: INTERACTIVE_TRANSACTION_MAX_WAIT_MS
    });

    if (
      shouldResyncSupplierCoverageOnUpdate(
        { companyId: existing.companyId, status: existing.status },
        { companyId: supplier.companyId, status: supplier.status }
      )
    ) {
      await syncSupplierClientCoverage(
        supplier.id,
        assertSupplierCompanyId(supplier.companyId, supplier.id),
        supplier.status
      );
    }

    const hydratedSupplier = await prisma.supplier.findUniqueOrThrow({
      where: { id: existing.id },
      include: supplierInclude()
    });

    res.json({ data: normalizeSupplier(hydratedSupplier as unknown as Record<string, unknown>) });
  })
);

suppliersRouter.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const input = statusSchema.parse(req.body);
    const existing = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      select: { id: true, companyId: true }
    });

    if (!existing) {
      throw new AppError(404, "SUPPLIER_NOT_FOUND", "Fornecedor nao encontrado.");
    }

    assertSameCompany(req, existing.companyId);

    const supplier = await prisma.$transaction(async (tx) => {
      const updatedSupplier = await tx.supplier.update({
        where: { id: existing.id },
        data: { status: input.status },
        include: supplierInclude()
      });

      return updatedSupplier;
    }, {
      timeout: INTERACTIVE_TRANSACTION_TIMEOUT_MS,
      maxWait: INTERACTIVE_TRANSACTION_MAX_WAIT_MS
    });

    await syncSupplierClientCoverage(
      supplier.id,
      assertSupplierCompanyId(supplier.companyId, supplier.id),
      supplier.status
    );

    const hydratedSupplier = await prisma.supplier.findUniqueOrThrow({
      where: { id: existing.id },
      include: supplierInclude()
    });

    res.json({ data: normalizeSupplier(hydratedSupplier as unknown as Record<string, unknown>) });
  })
);

suppliersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      select: { id: true, companyId: true }
    });

    if (!existing) {
      throw new AppError(404, "SUPPLIER_NOT_FOUND", "Fornecedor nao encontrado.");
    }

    assertSameCompany(req, existing.companyId);

    await prisma.$transaction(async (tx) => {
      await tx.supplier.update({
        where: { id: existing.id },
        data: { status: "INACTIVE" }
      });

      await tx.clientSupplier.deleteMany({
        where: { supplierId: existing.id }
      });
    });

    res.status(204).send();
  })
);
