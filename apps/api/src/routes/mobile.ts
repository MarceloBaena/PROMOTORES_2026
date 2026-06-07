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
      include: { user: true }
    });

    if (!promoter || promoter.status !== "ACTIVE") {
      throw new AppError(403, "PROMOTER_NOT_ACTIVE", "Promoter profile is not active.");
    }

    const routes = await prisma.route.findMany({
      where: {
        promoterId: promoter.id,
        status: "PUBLISHED"
      },
      orderBy: [{ scheduledDate: "asc" }, { createdAt: "asc" }],
      include: {
        items: {
          orderBy: { sequence: "asc" },
          include: { client: true }
        }
      }
    });
    const [publishedRoutesForPromoter, draftRoutesForPromoter, assignedClients] = await Promise.all([
      prisma.route.count({
        where: {
          promoterId: promoter.id,
          status: "PUBLISHED"
        }
      }),
      prisma.route.count({
        where: {
          promoterId: promoter.id,
          status: "DRAFT"
        }
      }),
      prisma.client.count({
        where: {
          defaultPromoterId: promoter.id,
          status: "ACTIVE"
        }
      })
    ]);

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
        routes,
        clients: Array.from(clientsById.values()),
        diagnostics: {
          publishedRoutesForPromoter,
          draftRoutesForPromoter,
          assignedClients
        }
      }
    });
  })
);
