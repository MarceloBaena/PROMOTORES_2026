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
  status: z.enum(["ACTIVE", "INACTIVE"]).optional()
});

const statusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"])
});

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

function supplierInclude() {
  return {
    company: true,
    categories: {
      include: {
        category: true
      }
    },
    _count: {
      select: {
        clients: true,
        categories: true
      }
    }
  } as const;
}

function normalizeSupplier(supplier: Record<string, unknown>) {
  const links = Array.isArray(supplier.categories) ? supplier.categories : [];

  return {
    ...supplier,
    categories: links
      .map((link) => (link as { category?: unknown }).category)
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
    const { categoryIds, ...supplierInput } = input;

    await assertUniqueDocument(companyId, supplierInput.document);
    const validCategoryIds = await validateCategoryIds(companyId, categoryIds);

    const supplier = await prisma.$transaction(async (tx) => {
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

      return tx.supplier.findUniqueOrThrow({
        where: { id: createdSupplier.id },
        include: supplierInclude()
      });
    });

    res.status(201).json({ data: normalizeSupplier(supplier as unknown as Record<string, unknown>) });
  })
);

suppliersRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = supplierSchema.partial().parse(req.body);
    const { categoryIds, ...supplierInput } = input;
    const existing = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      select: { id: true, companyId: true }
    });

    if (!existing) {
      throw new AppError(404, "SUPPLIER_NOT_FOUND", "Fornecedor nao encontrado.");
    }

    assertSameCompany(req, existing.companyId);
    const companyId = input.companyId ? requireCompanyId(req, input.companyId) : existing.companyId;

    if (!companyId) {
      throw new AppError(400, "COMPANY_REQUIRED", "Fornecedor precisa estar vinculado a uma empresa/filial.");
    }

    await assertUniqueDocument(companyId, supplierInput.document, existing.id);
    const validCategoryIds = categoryIds === undefined ? undefined : await validateCategoryIds(companyId, categoryIds);

    const supplier = await prisma.$transaction(async (tx) => {
      await tx.supplier.update({
        where: { id: existing.id },
        data: {
          ...supplierInput,
          companyId
        }
      });

      if (validCategoryIds !== undefined) {
        await tx.supplierProductCategory.deleteMany({
          where: { supplierId: existing.id }
        });

        if (validCategoryIds.length > 0) {
          await tx.supplierProductCategory.createMany({
            data: validCategoryIds.map((categoryId) => ({
              supplierId: existing.id,
              categoryId
            })),
            skipDuplicates: true
          });
        }
      }

      return tx.supplier.findUniqueOrThrow({
        where: { id: existing.id },
        include: supplierInclude()
      });
    });

    res.json({ data: normalizeSupplier(supplier as unknown as Record<string, unknown>) });
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

    const supplier = await prisma.supplier.update({
      where: { id: existing.id },
      data: { status: input.status },
      include: supplierInclude()
    });

    res.json({ data: normalizeSupplier(supplier as unknown as Record<string, unknown>) });
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

    await prisma.supplier.update({
      where: { id: existing.id },
      data: { status: "INACTIVE" }
    });

    res.status(204).send();
  })
);
