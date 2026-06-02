import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";
import { AppError } from "../lib/errors";
import { hashPassword } from "../services/auth-service";

export const promotersRouter = Router();

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  supervisorId: z.string().uuid().optional()
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional()
});

promotersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const promoters = await prisma.promoter.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { include: { role: true } },
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
    const role = await prisma.role.findUnique({ where: { code: "PROMOTOR" } });

    if (!role) {
      throw new AppError(500, "ROLE_NOT_FOUND", "Role PROMOTOR was not found. Run the bootstrap script.");
    }

    const promoter = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email.toLowerCase(),
          passwordHash: await hashPassword(input.password ?? "Promotor@123"),
          status: "ACTIVE",
          roleId: role.id
        }
      });

      return tx.promoter.create({
        data: {
          userId: user.id,
          status: "ACTIVE",
          supervisorId: input.supervisorId
        },
        include: {
          user: { include: { role: true } },
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

    const updated = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: promoter.userId },
        data: {
          name: input.name,
          email: input.email?.toLowerCase(),
          ...(input.password ? { passwordHash: await hashPassword(input.password) } : {})
        }
      });

      return tx.promoter.update({
        where: { id: promoter.id },
        data: {
          supervisorId: input.supervisorId,
          status: input.status
        },
        include: {
          user: { include: { role: true } },
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

    await prisma.$transaction([
      prisma.promoter.update({ where: { id: promoter.id }, data: { status: "INACTIVE" } }),
      prisma.user.update({ where: { id: promoter.userId }, data: { status: "INACTIVE" } })
    ]);

    res.status(204).send();
  })
);
