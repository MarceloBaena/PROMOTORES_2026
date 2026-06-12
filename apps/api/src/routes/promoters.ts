import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";
import { AppError } from "../lib/errors";
import { requireCompanyId, scopedCompanyWhere, assertSameCompany } from "../lib/tenant";
import { hashPassword } from "../services/auth-service";

export const promotersRouter = Router();

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const createSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do promotor."),
  email: z.string().trim().email("Informe um e-mail valido."),
  password: z.preprocess(
    emptyStringToUndefined,
    z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").optional()
  ),
  companyId: z.preprocess(
    emptyStringToUndefined,
    z.string().uuid("Selecione uma empresa/filial valida.").optional()
  ),
  supervisorId: z.preprocess(
    emptyStringToUndefined,
    z.string().uuid("Selecione um supervisor valido.").optional()
  )
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional()
});

promotersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const promoters = await prisma.promoter.findMany({
      where: scopedCompanyWhere(req),
      orderBy: { code: "asc" },
      include: {
        user: { include: { role: true } },
        company: true,
        supervisor: { include: { user: true } }
      }
    });

    res.json({ data: promoters });
  })
);

promotersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);
    const companyId = requireCompanyId(req, input.companyId);
    const role = await prisma.role.findUnique({ where: { code: "PROMOTOR" } });

    if (!role) {
      throw new AppError(500, "ROLE_NOT_FOUND", "Role PROMOTOR was not found. Run the bootstrap script.");
    }

    const email = input.email.toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      throw new AppError(409, "EMAIL_ALREADY_EXISTS", "Ja existe usuario cadastrado com este e-mail.");
    }

    if (input.supervisorId) {
      const supervisor = await prisma.supervisor.findUnique({
        where: { id: input.supervisorId },
        select: { companyId: true }
      });

      if (supervisor?.companyId !== companyId) {
        throw new AppError(400, "SUPERVISOR_COMPANY_MISMATCH", "Supervisor pertence a outra empresa/filial.");
      }
    }

    const promoter = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email,
          passwordHash: await hashPassword(input.password ?? "Promotor@123"),
          status: "ACTIVE",
          companyId,
          roleId: role.id
        }
      });

      return tx.promoter.create({
        data: {
          companyId,
          userId: user.id,
          status: "ACTIVE",
          supervisorId: input.supervisorId
        },
        include: {
          user: { include: { role: true } },
          company: true,
          supervisor: { include: { user: true } }
        }
      });
    });

    res.status(201).json({ data: promoter });
  })
);

promotersRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = updateSchema.parse(req.body);
    const promoter = await prisma.promoter.findUnique({ where: { id: req.params.id } });

    if (!promoter) {
      throw new AppError(404, "PROMOTER_NOT_FOUND", "Promoter was not found.");
    }

    assertSameCompany(req, promoter.companyId);
    const companyId = input.companyId ? requireCompanyId(req, input.companyId) : promoter.companyId;

    if (input.supervisorId) {
      const supervisor = await prisma.supervisor.findUnique({
        where: { id: input.supervisorId },
        select: { companyId: true }
      });

      if (supervisor?.companyId !== companyId) {
        throw new AppError(400, "SUPERVISOR_COMPANY_MISMATCH", "Supervisor pertence a outra empresa/filial.");
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: promoter.userId },
        data: {
          name: input.name,
          email: input.email?.toLowerCase(),
          companyId,
          ...(input.password ? { passwordHash: await hashPassword(input.password) } : {})
        }
      });

      return tx.promoter.update({
        where: { id: promoter.id },
        data: {
          companyId,
          supervisorId: input.supervisorId,
          status: input.status
        },
        include: {
          user: { include: { role: true } },
          company: true,
          supervisor: { include: { user: true } }
        }
      });
    });

    res.json({ data: updated });
  })
);

promotersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const promoter = await prisma.promoter.findUnique({ where: { id: req.params.id } });

    if (!promoter) {
      throw new AppError(404, "PROMOTER_NOT_FOUND", "Promoter was not found.");
    }

    assertSameCompany(req, promoter.companyId);

    await prisma.$transaction([
      prisma.promoter.update({ where: { id: promoter.id }, data: { status: "INACTIVE" } }),
      prisma.user.update({ where: { id: promoter.userId }, data: { status: "INACTIVE" } })
    ]);

    res.status(204).send();
  })
);
