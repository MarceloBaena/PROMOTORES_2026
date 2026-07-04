import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { asyncHandler } from "../middleware/async-handler";
import { assertSameCompany, isPlatformAdmin } from "../lib/tenant";

export const companiesRouter = Router();

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const companySchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da empresa/filial."),
  document: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
  contactName: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
  contactPhone: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
  contactEmail: z.preprocess(emptyStringToUndefined, z.string().trim().email("Informe um e-mail de contato valido.").optional()),
  address: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
  addressNumber: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
  district: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
  city: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
  state: z.preprocess(emptyStringToUndefined, z.string().trim().max(2).optional()),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional()
});

companiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const numericCode = /^\d+$/.test(q) ? Number(q) : undefined;
    const companies = await prisma.company.findMany({
      where: {
        ...(req.user?.companyId ? { id: req.user.companyId } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { document: { contains: q, mode: "insensitive" } },
                { city: { contains: q, mode: "insensitive" } },
                { state: { contains: q, mode: "insensitive" } },
                { contactName: { contains: q, mode: "insensitive" } },
                ...(numericCode ? [{ code: numericCode }] : [])
              ]
        }
          : {})
      },
      orderBy: { code: "asc" },
      take: 80
    });

    res.json({ data: companies });
  })
);

companiesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!isPlatformAdmin(req)) {
      throw new AppError(403, "PLATFORM_ADMIN_REQUIRED", "Apenas o administrador geral pode cadastrar empresas/filiais.");
    }

    const input = companySchema.parse(req.body);
    const company = await prisma.company.create({
      data: {
        ...input,
        status: input.status ?? "ACTIVE"
      }
    });

    res.status(201).json({ data: company });
  })
);

companiesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.company.findUnique({ where: { id: req.params.id } });

    if (!existing) {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa/filial nao encontrada.");
    }

    assertSameCompany(req, existing.id);
    const input = companySchema.partial().parse(req.body);
    const company = await prisma.company.update({
      where: { id: existing.id },
      data: input
    });

    res.json({ data: company });
  })
);

companiesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isPlatformAdmin(req)) {
      throw new AppError(403, "PLATFORM_ADMIN_REQUIRED", "Apenas o administrador geral pode inativar empresas/filiais.");
    }

    const existing = await prisma.company.findUnique({
      where: { id: req.params.id },
      select: { id: true }
    });

    if (!existing) {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa/filial nao encontrada.");
    }

    await prisma.company.update({
      where: { id: existing.id },
      data: { status: "INACTIVE" }
    });

    res.status(204).send();
  })
);
