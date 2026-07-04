import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";
import { AppError } from "../lib/errors";
import { requireCompanyId, scopedCompanyWhere, assertSameCompany, assertSupervisorScope, requireSupervisorProfileId } from "../lib/tenant";
import { endOfDay } from "../lib/route-window";
import { summarizeRouteProgress } from "../services/route-status";

export const routePlansRouter = Router();

const routeSchema = z.object({
  name: z.string().min(2),
  companyId: z.string().uuid().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"]).optional(),
  scheduledDate: z.string().datetime().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  supervisorId: z.string().uuid().optional(),
  promoterId: z.string().uuid().optional(),
  clientIds: z.array(z.string().uuid()).default([])
});

function routeIsCompletedByItems(route: { items: Array<{ status: string }> }) {
  return route.items.length > 0 && route.items.every((item) => item.status === "COMPLETED");
}

async function reconcileCompletedRoute(tx: Prisma.TransactionClient, routeId: string) {
  const route = await tx.route.findUnique({
    where: { id: routeId },
    select: {
      status: true,
      items: { select: { status: true } }
    }
  });

  if (!route || route.status === "COMPLETED" || !routeIsCompletedByItems(route)) {
    return;
  }

  await tx.route.update({
    where: { id: routeId },
    data: { status: "COMPLETED" }
  });
}

function resolveRoutePeriod(input: z.infer<typeof routeSchema>) {
  const startDate = input.startDate ? new Date(input.startDate) : input.scheduledDate ? new Date(input.scheduledDate) : null;
  const endDate = input.endDate ? new Date(input.endDate) : startDate ? endOfDay(startDate) : null;

  if (!startDate || !endDate) {
    throw new AppError(400, "ROUTE_PERIOD_REQUIRED", "Informe a data inicial e a data final da rota.");
  }

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new AppError(400, "ROUTE_PERIOD_INVALID", "As datas da rota sao invalidas.");
  }

  if (endDate < startDate) {
    throw new AppError(400, "ROUTE_PERIOD_INVALID", "A data final da rota precisa ser maior ou igual a data inicial.");
  }

  return {
    scheduledDate: startDate,
    startDate,
    endDate
  };
}

async function deactivatePreviousPublishedRoutes(
  tx: Prisma.TransactionClient,
  input: { companyId: string; promoterId?: string | null; exceptRouteId?: string }
) {
  if (!input.promoterId) {
    return;
  }

  const publishedRoutes = await tx.route.findMany({
    where: {
      companyId: input.companyId,
      promoterId: input.promoterId,
      status: "PUBLISHED",
      ...(input.exceptRouteId ? { id: { not: input.exceptRouteId } } : {})
    },
    select: {
      id: true,
      items: { select: { status: true } }
    }
  });

  const completedRouteIds = publishedRoutes
    .filter(routeIsCompletedByItems)
    .map((route) => route.id);
  const unfinishedRouteIds = publishedRoutes
    .filter((route) => !completedRouteIds.includes(route.id))
    .map((route) => route.id);

  if (completedRouteIds.length > 0) {
    await tx.route.updateMany({
      where: { id: { in: completedRouteIds } },
      data: { status: "COMPLETED" }
    });
  }

  if (unfinishedRouteIds.length > 0) {
    await tx.route.updateMany({
      where: { id: { in: unfinishedRouteIds } },
      data: { status: "CANCELLED" }
    });
  }
}

routePlansRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const ownSupervisorId = req.user?.role === "SUPERVISOR" ? requireSupervisorProfileId(req) : null;
    const routes = await prisma.route.findMany({
      where: {
        ...scopedCompanyWhere(req),
        ...(ownSupervisorId
          ? {
              OR: [
                { supervisorId: ownSupervisorId },
                { promoter: { supervisorId: ownSupervisorId } }
              ]
            }
          : {})
      },
      orderBy: { createdAt: "desc" },
      include: {
        company: true,
        promoter: { include: { user: true } },
        supervisor: { include: { user: true } },
        items: {
          include: {
            client: true,
            visits: {
              select: {
                status: true
              }
            }
          },
          orderBy: { sequence: "asc" }
        }
      }
    });

    const now = new Date();

    res.json({
      data: routes.map((route) => {
        const progress = summarizeRouteProgress(route, now);

        return {
          ...route,
          progress,
          operationalStatus: progress.operationalStatus
        };
      })
    });
  })
);

routePlansRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = routeSchema.parse(req.body);
    const companyId = requireCompanyId(req, input.companyId);
    const ownSupervisorId = req.user?.role === "SUPERVISOR" ? requireSupervisorProfileId(req) : null;
    const supervisorId = ownSupervisorId ?? input.supervisorId;

    const [supervisor, promoter, clients] = await Promise.all([
      supervisorId ? prisma.supervisor.findUnique({ where: { id: supervisorId }, select: { companyId: true } }) : null,
      input.promoterId ? prisma.promoter.findUnique({ where: { id: input.promoterId }, select: { companyId: true, supervisorId: true } }) : null,
      prisma.client.findMany({ where: { id: { in: input.clientIds } }, select: { id: true, companyId: true } })
    ]);

    if (ownSupervisorId && input.supervisorId && input.supervisorId !== ownSupervisorId) {
      throw new AppError(403, "SUPERVISOR_FORBIDDEN", "Supervisor pode criar rota apenas para a propria equipe.");
    }

    if (supervisor && supervisor.companyId !== companyId) {
      throw new AppError(400, "SUPERVISOR_COMPANY_MISMATCH", "Supervisor pertence a outra empresa/filial.");
    }

    if (promoter && promoter.companyId !== companyId) {
      throw new AppError(400, "PROMOTER_COMPANY_MISMATCH", "Promotor pertence a outra empresa/filial.");
    }

    if (ownSupervisorId && promoter?.supervisorId !== ownSupervisorId) {
      throw new AppError(403, "SUPERVISOR_FORBIDDEN", "Supervisor pode publicar rota apenas para promotores da propria equipe.");
    }

    if (clients.length !== input.clientIds.length || clients.some((client) => client.companyId !== companyId)) {
      throw new AppError(400, "CLIENT_COMPANY_MISMATCH", "Todos os clientes da rota precisam pertencer a mesma empresa/filial.");
    }

    const routePeriod = resolveRoutePeriod(input);
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
          scheduledDate: routePeriod.scheduledDate,
          startDate: routePeriod.startDate,
          endDate: routePeriod.endDate,
          supervisorId,
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

    const progress = summarizeRouteProgress(route, new Date());
    res.status(201).json({ data: { ...route, progress, operationalStatus: progress.operationalStatus } });
  })
);

routePlansRouter.put(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const input = z.object({ status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"]) }).parse(req.body);
    const existing = await prisma.route.findUnique({
      where: { id: req.params.id },
      select: { companyId: true, promoterId: true, supervisorId: true, promoter: { select: { supervisorId: true } } }
    });

    if (!existing) {
      throw new AppError(404, "ROUTE_NOT_FOUND", "Rota nao encontrada.");
    }

    assertSameCompany(req, existing.companyId);
    assertSupervisorScope(req, existing.supervisorId ?? existing.promoter?.supervisorId);
    const route = await prisma.$transaction(async (tx) => {
      if (input.status === "PUBLISHED" && existing.companyId) {
        await deactivatePreviousPublishedRoutes(tx, {
          companyId: existing.companyId,
          promoterId: existing.promoterId,
          exceptRouteId: req.params.id
        });
      }

      const route = await tx.route.update({
        where: { id: req.params.id },
        data: { status: input.status },
        include: {
          company: true,
          promoter: { include: { user: true } },
          supervisor: { include: { user: true } },
          items: {
            include: {
              client: true,
              visits: {
                select: {
                  status: true
                }
              }
            },
            orderBy: { sequence: "asc" }
          }
        }
      });

      await reconcileCompletedRoute(tx, route.id);
      const progress = summarizeRouteProgress(route, new Date());
      return { ...route, progress, operationalStatus: progress.operationalStatus };
    });

    res.json({ data: route });
  })
);
