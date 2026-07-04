import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";
import { AppError } from "../lib/errors";
import { scopedCompanyWhere, assertSameCompany, requireSupervisorProfileId } from "../lib/tenant";
import { buildRouteWindowWhere } from "../lib/route-window";

export const promoterLocationsRouter = Router();

const locationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracyMeters: z.coerce.number().min(0).max(10000).optional(),
  capturedAt: z.string().datetime().optional(),
  visitId: z.string().uuid().optional()
});

function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function locationStatus(capturedAt?: Date | null) {
  if (!capturedAt) {
    return "offline";
  }

  const ageMs = Date.now() - capturedAt.getTime();

  if (ageMs <= 2 * 60 * 1000) {
    return "online";
  }

  if (ageMs <= 10 * 60 * 1000) {
    return "stale";
  }

  return "offline";
}

function dayBounds(referenceDate: Date) {
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(referenceDate);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function todayBounds() {
  return dayBounds(new Date());
}

promoterLocationsRouter.get(
  "/live",
  asyncHandler(async (req, res) => {
    if (!req.user || !["ADMIN", "SUPERVISOR"].includes(req.user.role)) {
      throw new AppError(403, "LIVE_MAP_FORBIDDEN", "Only admins and supervisors can view the live map.");
    }

    const { start, end } = todayBounds();
    const routeWindowWhere = buildRouteWindowWhere(start, end);
    const supervisorScope = req.user.role === "SUPERVISOR" ? { supervisorId: requireSupervisorProfileId(req) } : {};
    const promoters = await prisma.promoter.findMany({
      where: {
        ...scopedCompanyWhere(req),
        ...supervisorScope,
        status: "ACTIVE",
        user: { status: "ACTIVE" }
      },
      orderBy: { code: "asc" },
      include: {
        user: true,
        supervisor: { include: { user: true } },
        locations: {
          orderBy: { capturedAt: "desc" },
          take: 1
        },
        visits: {
          where: { status: "in_progress" },
          orderBy: { updatedAt: "desc" },
          take: 1,
          include: { client: true, route: true }
        },
        routes: {
          where: {
            status: "PUBLISHED",
            ...routeWindowWhere,
            items: {
              some: {
                status: "PLANNED"
              }
            }
          },
          orderBy: [{ startDate: "asc" }, { scheduledDate: "asc" }],
          take: 1,
          include: {
            items: {
              where: { status: "PLANNED" },
              select: { id: true }
            }
          }
        }
      }
    });

    res.json({
      data: promoters.map((promoter) => {
        const latestLocation = promoter.locations[0];
        const activeVisit = promoter.visits[0];
        const activeRoute = promoter.routes[0];

        return {
          promoter: {
            id: promoter.id,
            code: promoter.code,
            name: promoter.user.name,
            email: promoter.user.email,
            supervisorName: promoter.supervisor?.user.name ?? null
          },
          activeVisit: activeVisit
            ? {
                id: activeVisit.id,
                clientName: activeVisit.client.name,
                routeName: activeVisit.route?.name ?? null,
                startedAt: activeVisit.startedAt
              }
            : null,
          activeRoute: activeRoute
            ? {
                id: activeRoute.id,
                name: activeRoute.name,
                scheduledDate: activeRoute.scheduledDate,
                startDate: activeRoute.startDate,
                endDate: activeRoute.endDate,
                pendingItems: activeRoute.items.length
              }
            : null,
          location: latestLocation
            ? {
                latitude: toNumber(latestLocation.latitude),
                longitude: toNumber(latestLocation.longitude),
                accuracyMeters: toNumber(latestLocation.accuracyMeters),
                capturedAt: latestLocation.capturedAt,
                receivedAt: latestLocation.receivedAt,
                source: latestLocation.source
              }
            : null,
          status: locationStatus(latestLocation?.capturedAt ?? null)
        };
      })
    });
  })
);

promoterLocationsRouter.post(
  "/heartbeat",
  asyncHandler(async (req, res) => {
    if (!req.user || req.user.role !== "PROMOTOR") {
      throw new AppError(403, "PROMOTER_LOCATION_FORBIDDEN", "Only promoters can send live location heartbeats.");
    }

    const input = locationSchema.parse(req.body);
    const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();
    const { start, end } = dayBounds(capturedAt);
    const routeWindowWhere = buildRouteWindowWhere(start, end);
    const promoter = await prisma.promoter.findUnique({
      where: { userId: req.user.id },
      include: {
        visits: {
          where: {
            status: "in_progress",
            ...(input.visitId ? { id: input.visitId } : {})
          },
          orderBy: { updatedAt: "desc" },
          take: 1
        },
        routes: {
          where: {
            status: "PUBLISHED",
            ...routeWindowWhere
          },
          orderBy: [{ startDate: "asc" }, { scheduledDate: "asc" }],
          take: 1
        }
      }
    });

    if (!promoter || promoter.status !== "ACTIVE") {
      throw new AppError(404, "PROMOTER_NOT_FOUND", "Promoter profile was not found.");
    }

    assertSameCompany(req, promoter.companyId);

    const activeVisit = promoter.visits[0];
    const activeRoute = promoter.routes[0];

    if (!activeVisit && !activeRoute) {
      throw new AppError(
        409,
        "ACTIVE_JOURNEY_REQUIRED",
        "Location heartbeat is allowed only during an active visit or a published route scheduled for today."
      );
    }

    const location = await prisma.promoterLocation.create({
      data: {
        promoterId: promoter.id,
        companyId: promoter.companyId,
        visitId: activeVisit?.id ?? null,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyMeters: input.accuracyMeters,
        capturedAt,
        source: "mobile"
      }
    });

    res.status(201).json({
      data: {
        id: location.id,
        promoterId: location.promoterId,
        visitId: location.visitId,
        latitude: toNumber(location.latitude),
        longitude: toNumber(location.longitude),
        accuracyMeters: toNumber(location.accuracyMeters),
        capturedAt: location.capturedAt,
        receivedAt: location.receivedAt
      }
    });
  })
);
