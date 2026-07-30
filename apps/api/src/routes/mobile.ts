import { Router } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { asyncHandler } from "../middleware/async-handler";
import { buildRouteWindowWhere, endOfDay, startOfDay } from "../lib/route-window";

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

    const now = new Date();
    const routeWindowWhere = buildRouteWindowWhere(startOfDay(now), endOfDay(now));
    const publishedRoutes = await prisma.route.findMany({
      where: {
        companyId: promoter.companyId,
        promoterId: promoter.id,
        status: "PUBLISHED",
        OR: [
          { endDate: null },
          { endDate: { gte: now } }
        ],
        ...routeWindowWhere
      },
      orderBy: [{ startDate: "asc" }, { scheduledDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        status: true,
        scheduledDate: true,
        startDate: true,
        endDate: true,
        items: {
          where: {
            status: "PLANNED",
            visits: {
              none: {
                status: "completed"
              }
            }
          },
          orderBy: { sequence: "asc" },
          select: {
            id: true,
            routeId: true,
            clientId: true,
            sequence: true,
            status: true,
            plannedStart: true,
            plannedEnd: true,
            client: {
              include: {
                suppliers: {
                  include: {
                    supplier: {
                      include: {
                        activities: {
                          where: {
                            activity: {
                              status: "ACTIVE"
                            }
                          },
                          include: {
                            activity: true
                          },
                          orderBy: {
                            activity: {
                              name: "asc"
                            }
                          }
                        },
                        categories: {
                          where: {
                            category: {
                              status: "ACTIVE"
                            }
                          },
                          include: {
                            category: true
                          },
                          orderBy: {
                            category: {
                              name: "asc"
                            }
                          }
                        }
                      }
                    }
                  }
                },
                activities: {
                  include: {
                    activity: true
                  }
                }
              }
            }
          }
        }
      }
    });
    const routes = publishedRoutes
      .filter((route) => route.items.length > 0)
      .map((route) => ({
        ...route,
        items: route.items.map((item) => ({
          ...item,
          client: {
            ...item.client,
            suppliers: item.client.suppliers.map((link) => ({
              ...link.supplier,
              activities: link.supplier.activities.map((activityLink) => activityLink.activity),
              categories: link.supplier.categories.map((categoryLink) => categoryLink.category)
            })),
            activities: item.client.activities.map((link) => link.activity)
          }
        }))
      }));

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
