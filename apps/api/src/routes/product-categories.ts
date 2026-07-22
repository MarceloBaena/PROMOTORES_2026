import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { asyncHandler } from "../middleware/async-handler";
import { assertSameCompany, requireCompanyId, scopedCompanyWhere } from "../lib/tenant";

export const productCategoriesRouter = Router();

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const categorySchema = z.object({
  companyId: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome da categoria."),
  description: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional()
});

async function assertUniqueCategoryName(companyId: string, name?: string, ignoreId?: string) {
  if (!name) {
    return;
  }

  const existing = await prisma.productCategory.findFirst({
    where: {
      companyId,
      name,
      ...(ignoreId ? { id: { not: ignoreId } } : {})
    },
    select: { id: true }
  });

  if (existing) {
    throw new AppError(409, "CATEGORY_ALREADY_EXISTS", "Ja existe categoria com este nome nesta empresa/filial.");
  }
}

function categoryInclude() {
  return {
    company: true,
    _count: {
      select: {
        suppliers: true
      }
    }
  } as const;
}

productCategoriesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const numericCode = /^\d+$/.test(q) ? Number(q) : undefined;

    const categories = await prisma.productCategory.findMany({
      where: {
        ...scopedCompanyWhere(req),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { company: { name: { contains: q, mode: "insensitive" } } },
                ...(numericCode ? [{ code: numericCode }] : [])
              ]
            }
          : {})
      },
      orderBy: [{ status: "asc" }, { code: "asc" }],
      take: 1000,
      include: categoryInclude()
    });

    res.json({ data: categories });
  })
);

productCategoriesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = categorySchema.parse(req.body);
    const companyId = requireCompanyId(req, input.companyId);

    await assertUniqueCategoryName(companyId, input.name);

    const category = await prisma.productCategory.create({
      data: {
        ...input,
        companyId,
        status: input.status ?? "ACTIVE"
      },
      include: categoryInclude()
    });

    res.status(201).json({ data: category });
  })
);

productCategoriesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = categorySchema.partial().parse(req.body);
    const existing = await prisma.productCategory.findUnique({
      where: { id: req.params.id },
      select: { id: true, companyId: true }
    });

    if (!existing) {
      throw new AppError(404, "CATEGORY_NOT_FOUND", "Categoria nao encontrada.");
    }

    assertSameCompany(req, existing.companyId);
    const companyId = input.companyId ? requireCompanyId(req, input.companyId) : existing.companyId;

    if (!companyId) {
      throw new AppError(400, "COMPANY_REQUIRED", "Categoria precisa estar vinculada a uma empresa/filial.");
    }

    await assertUniqueCategoryName(companyId, input.name, existing.id);

    const category = await prisma.productCategory.update({
      where: { id: existing.id },
      data: {
        ...input,
        companyId
      },
      include: categoryInclude()
    });

    res.json({ data: category });
  })
);

productCategoriesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.productCategory.findUnique({
      where: { id: req.params.id },
      select: { id: true, companyId: true }
    });

    if (!existing) {
      throw new AppError(404, "CATEGORY_NOT_FOUND", "Categoria nao encontrada.");
    }

    assertSameCompany(req, existing.companyId);

    await prisma.productCategory.update({
      where: { id: existing.id },
      data: { status: "INACTIVE" }
    });

    res.status(204).send();
  })
);
