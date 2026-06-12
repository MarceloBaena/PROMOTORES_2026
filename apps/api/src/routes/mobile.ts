import { Router } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { asyncHandler } from "../middleware/async-handler";

export const mobileRouter = Router();

mobileRouter.get(
  "/snapshot",
  asyncHandler(async (req, res) => {
    if (!req.user || req.user.role !== "PROMOTOR") {
      throw new AppError(403, "FORBIDDEN", "Only promoters can download the mobile snapshot.");
    }

    const promoter = await prisma.promoter.findUnique({
      where: { userId: req.user.id },
      select: {
        id: true,
        code: true,
        status: true,
        companyId: true,
        user: {
          select: {
            name: true,
            email: true
          }
        },
        company: {
          select: {
            id: true,
            code: true,
            name: true
          }
        }
      }
    });

    if (!promoter || promoter.status !== "ACTIVE") {
      throw new AppError(403, "PROMOTER_NOT_ACTIVE", "Promoter profile is not active.");
    }

    const routes = await prisma.route.findMany({
      where: {
        companyId: promoter.companyId,
        promoterId: promoter.id,
        status: "PUBLISHED"
      },
      orderBy: [{ scheduledDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        status: true,
        scheduledDate: true,
        items: {
          orderBy: { sequence: "asc" },
          select: {
            id: true,
            routeId: true,
            clientId: true,
            sequence: true,
            status: true,
            plannedStart: true,
            plannedEnd: true,
            client: true
          }
        }
      }
    });

    const clientsById = new Map<string, (typeof routes)[number]["items"][number]["client"]>();

    for (const route of routes) {
      for (const item of route.items) {
        clientsById.set(item.client.id, item.client);
      }
    }

    res.json({
      data: {
        downloadedAt: new Date().toISOString(),
        promoter: {
          id: promoter.id,
          code: promoter.code,
          name: promoter.user.name,
          email: promoter.user.email
        },
        company: promoter.company
          ? {
              id: promoter.company.id,
              code: promoter.company.code,
              name: promoter.company.name
            }
          : null,
        routes,
        clients: Array.from(clientsById.values())
      }
    });
  })
);
