import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";
import { AppError } from "../lib/errors";
import { hashPassword } from "../services/auth-service";

export const supervisorsRouter = Router();

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  region: z.string().optional()
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional()
});

supervisorsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const promoterId = req.query.promoterId ? String(req.query.promoterId) : undefined;
    const where = promoterId
      ? { promoters: { some: { id: promoterId } } }
      : undefined;

    const supervisors = await prisma.supervisor.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { user: { include: { role: true } } }
    });

    res.json({ data: supervisors });
  })
);

supervisorsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);
    const role = await prisma.role.findUnique({ where: { code: "SUPERVISOR" } });

    if (!role) {
      throw new AppError(500, "ROLE_NOT_FOUND", "Role SUPERVISOR was not found. Run the bootstrap script.");
    }

    const supervisor = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email.toLowerCase(),
          passwordHash: await hashPassword(input.password ?? "Supervisor@123"),
          status: "ACTIVE",
          roleId: role.id
        }
      });

      return tx.supervisor.create({
        data: {
          userId: user.id,
          status: "ACTIVE",
          region: input.region
        },
        include: { user: { include: { role: true } } }
      });
    });

    res.status(201).json({ data: supervisor });
  })
);

supervisorsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = updateSchema.parse(req.body);
    const supervisor = await prisma.supervisor.findUnique({ where: { id: req.params.id } });

    if (!supervisor) {
      throw new AppError(404, "SUPERVISOR_NOT_FOUND", "Supervisor was not found.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: supervisor.userId },
        data: {
          name: input.name,
          email: input.email?.toLowerCase(),
          ...(input.password ? { passwordHash: await hashPassword(input.password) } : {})
        }
      });

      return tx.supervisor.update({
        where: { id: supervisor.id },
        data: {
          status: input.status,
          region: input.region
        },
        include: { user: { include: { role: true } } }
      });
    });

    res.json({ data: updated });
  })
);

supervisorsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const supervisor = await prisma.supervisor.findUnique({ where: { id: req.params.id } });

    if (!supervisor) {
      throw new AppError(404, "SUPERVISOR_NOT_FOUND", "Supervisor was not found.");
    }

    await prisma.$transaction([
      prisma.supervisor.update({ where: { id: supervisor.id }, data: { status: "INACTIVE" } }),
      prisma.user.update({ where: { id: supervisor.userId }, data: { status: "INACTIVE" } })
    ]);

    res.status(204).send();
  })
);
