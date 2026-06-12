import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";
import { AppError } from "../lib/errors";
import { requireCompanyId, scopedCompanyWhere, assertSameCompany } from "../lib/tenant";

export const routePlansRouter = Router();

const routeSchema = z.object({
  name: z.string().min(2),
  companyId: z.string().uuid().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"]).optional(),
  scheduledDate: z.string().datetime().optional(),
  supervisorId: z.string().uuid().optional(),
  promoterId: z.string().uuid().optional(),
  clientIds: z.array(z.string().uuid()).default([])
});

async function deactivatePreviousPublishedRoutes(
  tx: Prisma.TransactionClient,
  input: { companyId: string; promoterId?: string | null; exceptRouteId?: string }
) {
  if (!input.promoterId) {
    return;
  }

  await tx.route.updateMany({
    where: {
      companyId: input.companyId,
      promoterId: input.promoterId,
      status: "PUBLISHED",
      ...(input.exceptRouteId ? { id: { not: input.exceptRouteId } } : {})
    },
    data: { status: "CANCELLED" }
  });
}

routePlansRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const routes = await prisma.route.findMany({
      where: scopedCompanyWhere(req),
      orderBy: { createdAt: "desc" },
      include: {
        company: true,
        promoter: { include: { user: true } },
        supervisor: { include: { user: true } },
        items: { include: { client: true }, orderBy: { sequence: "asc" } }
      }
    });

    res.json({ data: routes });
  })
);

routePlansRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = routeSchema.parse(req.body);
    const companyId = requireCompanyId(req, input.companyId);

    const [supervisor, promoter, clients] = await Promise.all([
      input.supervisorId ? prisma.supervisor.findUnique({ where: { id: input.supervisorId }, select: { companyId: true } }) : null,
      input.promoterId ? prisma.promoter.findUnique({ where: { id: input.promoterId }, select: { companyId: true } }) : null,
      prisma.client.findMany({ where: { id: { in: input.clientIds } }, select: { id: true, companyId: true } })
    ]);

    if (supervisor && supervisor.companyId !== companyId) {
      throw new AppError(400, "SUPERVISOR_COMPANY_MISMATCH", "Supervisor pertence a outra empresa/filial.");
    }

    if (promoter && promoter.companyId !== companyId) {
      throw new AppError(400, "PROMOTER_COMPANY_MISMATCH", "Promotor pertence a outra empresa/filial.");
    }

    if (clients.length !== input.clientIds.length || clients.some((client) => client.companyId !== companyId)) {
      throw new AppError(400, "CLIENT_COMPANY_MISMATCH", "Todos os clientes da rota precisam pertencer a mesma empresa/filial.");
    }

    const route = await prisma.$transaction(async (tx) => {
      const status = input.status ?? "DRAFT";

      if (status === "PUBLISHED") {
        await deactivatePreviousPublishedRoutes(tx, { companyId, promoterId: input.promoterId });
      }

      return tx.route.create({
        data: {
          companyId,
          name: input.name,
          status,
          scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : undefined,
          supervisorId: input.supervisorId,
          promoterId: input.promoterId,
          items: {
            create: input.clientIds.map((clientId, index) => ({
              clientId,
              sequence: index + 1,
              status: "PLANNED"
            }))
          }
        },
        include: {
          company: true,
          promoter: { include: { user: true } },
          supervisor: { include: { user: true } },
          items: { include: { client: true }, orderBy: { sequence: "asc" } }
        }
      });
    });

    res.status(201).json({ data: route });
  })
);

routePlansRouter.put(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const input = z.object({ status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"]) }).parse(req.body);
    const existing = await prisma.route.findUnique({
      where: { id: req.params.id },
      select: { companyId: true, promoterId: true }
    });

    if (!existing) {
      throw new AppError(404, "ROUTE_NOT_FOUND", "Rota nao encontrada.");
    }

    assertSameCompany(req, existing.companyId);
    const route = await prisma.$transaction(async (tx) => {
      if (input.status === "PUBLISHED" && existing.companyId) {
        await deactivatePreviousPublishedRoutes(tx, {
          companyId: existing.companyId,
          promoterId: existing.promoterId,
          exceptRouteId: req.params.id
        });
      }

      return tx.route.update({
        where: { id: req.params.id },
        data: { status: input.status },
        include: {
          items: { include: { client: true }, orderBy: { sequence: "asc" } }
        }
      });
    });

    res.json({ data: route });
  })
);
