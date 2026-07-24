import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";
import { AppError } from "../lib/errors";
import { scopedCompanyWhere, assertSameCompany } from "../lib/tenant";
import { buildRouteWindowWhere } from "../lib/route-window";

export const promoterLocationsRouter = Router();

const locationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracyMeters: z.coerce.number().min(0).max(10000).optional(),
  capturedAt: z.string().datetime().optional(),
  visitId: z.string().uuid().optional(),
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

  if (ageMs <= 5 * 60 * 1000) {
    return "online";
  }

  if (ageMs <= 30 * 60 * 1000) {
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

function visitDurationMinutes(start?: Date | null, end?: Date | null) {
  if (!start) {
    return 0;
  }

  const finish = end ?? new Date();
  const diffMs = finish.getTime() - start.getTime();
  return Math.max(0, Math.round(diffMs / 60000));
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(bLat - aLat);
  const deltaLng = toRadians(bLng - aLng);
  const originLat = toRadians(aLat);
  const targetLat = toRadians(bLat);

  const base =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(originLat) *
      Math.cos(targetLat) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(base), Math.sqrt(1 - base));
}

function calculateDistanceKm(
  locations: Array<{
    latitude: number | null;
    longitude: number | null;
    capturedAt: Date;
  }>,
) {
  const chronological = [...locations]
    .filter(
      (location) =>
        typeof location.latitude === "number" &&
        typeof location.longitude === "number",
    )
    .sort(
      (left, right) => left.capturedAt.getTime() - right.capturedAt.getTime(),
    );

  let distanceKm = 0;
  for (let index = 1; index < chronological.length; index += 1) {
    const previous = chronological[index - 1];
    const current = chronological[index];

    distanceKm += haversineKm(
      previous.latitude as number,
      previous.longitude as number,
      current.latitude as number,
      current.longitude as number,
    );
  }

  return Number(distanceKm.toFixed(1));
}

function photoTypeLabel(type: string) {
  switch (type) {
    case "checkin":
      return "check-in";
    case "before":
      return "foto antes";
    case "after":
      return "foto depois";
    case "checkout":
      return "check-out";
    case "supplier_before":
      return "foto antes do fornecedor";
    case "supplier_after":
      return "foto depois do fornecedor";
    case "leaflet":
      return "panfleto";
    case "gondola":
      return "gondola";
    case "display":
      return "display";
    case "island":
      return "ilha";
    case "promotional_material":
      return "material promocional";
    case "store_extra":
      return "foto extra da loja";
    case "occurrence_extra":
      return "foto extra";
    default:
      return "evidencia";
  }
}

function metadataObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) && !(numberValue === 0)
    ? numberValue
    : null;
}

function supplierDisplayName(
  supplier?: { name: string; tradeName: string | null } | null,
) {
  if (!supplier) {
    return null;
  }

  const tradeName = supplier.tradeName?.trim();
  return tradeName || supplier.name;
}

function clientDisplayName(client: {
  name: string;
  tradeName?: string | null;
}) {
  const tradeName = client.tradeName?.trim();
  return tradeName && tradeName !== client.name
    ? `${client.name} | Fantasia: ${tradeName}`
    : client.name;
}

function buildTimeline(input: {
  latestLocation?: {
    latitude: number | null;
    longitude: number | null;
    accuracyMeters: number | null;
    capturedAt: Date;
  } | null;
  routeOfDay?: {
    id: string;
    name: string;
    status: string;
    scheduledDate: Date | null;
    createdAt: Date;
    items: Array<{
      id: string;
      status: string;
      client: { name: string; tradeName: string | null };
    }>;
  } | null;
  visits: Array<{
    id: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    updatedAt: Date;
    client: { name: string; tradeName: string | null };
    route: { name: string } | null;
    photos: Array<{
      id: string;
      type: string;
      url: string;
      createdAt: Date;
      capturedAtDevice: Date | null;
      metadata: unknown;
      supplier: { name: string; tradeName: string | null } | null;
      supplierExecution: {
        supplier: { name: string; tradeName: string | null } | null;
      } | null;
    }>;
    supplierExecutions: Array<{
      id: string;
      status: string;
      deliveryReceived: boolean | null;
      stockoutFound: boolean | null;
      notes: string | null;
      startedAtDevice: Date | null;
      finishedAtDevice: Date | null;
      updatedAt: Date;
      supplier: { name: string; tradeName: string | null };
    }>;
  }>;
}) {
  const timeline: Array<{
    id: string;
    kind:
      | "route"
      | "visit_started"
      | "visit_completed"
      | "photo"
      | "signal"
      | "supplier_note";
    occurredAt: Date;
    tone: "brand" | "success" | "warning" | "neutral";
    title: string;
    description: string;
    photoUrls?: string[];
    photos?: Array<{
      id: string;
      type: string;
      title: string;
      url: string;
      createdAt: Date;
      capturedAt: Date;
      gpsLatitude: number | null;
      gpsLongitude: number | null;
      supplierName: string | null;
      categoryName: string | null;
    }>;
    latitude?: number | null;
    longitude?: number | null;
  }> = [];

  if (input.routeOfDay) {
    const totalClients = input.routeOfDay.items.length;
    const completedClients = input.routeOfDay.items.filter(
      (item) => item.status === "COMPLETED",
    ).length;
    timeline.push({
      id: `route-${input.routeOfDay.id}`,
      kind: "route",
      occurredAt: input.routeOfDay.scheduledDate ?? input.routeOfDay.createdAt,
      tone: input.routeOfDay.status === "COMPLETED" ? "success" : "brand",
      title:
        input.routeOfDay.status === "COMPLETED"
          ? `Roteiro ${input.routeOfDay.name} concluido`
          : `Roteiro ${input.routeOfDay.name} publicado`,
      description: `${completedClients} de ${totalClients} cliente(s) do roteiro ja foram processados no dia.`,
    });
  }

  if (input.latestLocation) {
    timeline.push({
      id: `signal-${input.latestLocation.capturedAt.toISOString()}`,
      kind: "signal",
      occurredAt: input.latestLocation.capturedAt,
      tone: "neutral",
      title: "Ultimo sinal recebido do aparelho",
      description:
        input.latestLocation.accuracyMeters !== null
          ? `Precisao aproximada de ${Math.round(input.latestLocation.accuracyMeters)} metro(s).`
          : "Sinal enviado sem precisao registrada.",
      latitude: input.latestLocation.latitude,
      longitude: input.latestLocation.longitude,
    });
  }

  for (const visit of input.visits) {
    const routeName = visit.route?.name ?? "rota sem nome";
    const clientName = clientDisplayName(visit.client);

    if (visit.startedAt) {
      timeline.push({
        id: `visit-start-${visit.id}`,
        kind: "visit_started",
        occurredAt: visit.startedAt,
        tone: "brand",
        title: `Inicio de atendimento em ${clientName}`,
        description: `Roteiro ${routeName}.`,
      });
    }

    if (visit.photos.length > 0) {
      const latestPhoto = [...visit.photos].sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )[0];
      const photoKinds = Array.from(
        new Set(visit.photos.map((photo) => photoTypeLabel(photo.type))),
      ).join(", ");
      const timelinePhotos = visit.photos.slice(0, 5).map((photo) => {
        const metadata = metadataObject(photo.metadata);
        const supplierName =
          supplierDisplayName(photo.supplier) ??
          supplierDisplayName(photo.supplierExecution?.supplier) ??
          null;
        const categoryName = metadataString(metadata, "categoryName");
        const gpsLatitude = metadataNumber(metadata, "gpsLatitude");
        const gpsLongitude = metadataNumber(metadata, "gpsLongitude");
        const capturedAt =
          photo.capturedAtDevice ??
          (metadataString(metadata, "capturedAt")
            ? new Date(metadataString(metadata, "capturedAt") as string)
            : photo.createdAt);
        const baseLabel = photoTypeLabel(photo.type);
        const titleParts = [supplierName, categoryName, baseLabel].filter(
          Boolean,
        );

        return {
          id: photo.id,
          type: photo.type,
          title: titleParts.length > 0 ? titleParts.join(" - ") : baseLabel,
          url: photo.url,
          createdAt: photo.createdAt,
          capturedAt,
          gpsLatitude,
          gpsLongitude,
          supplierName,
          categoryName,
        };
      });
      const latestPhotoMetadata = metadataObject(latestPhoto.metadata);
      const latestPhotoLatitude = metadataNumber(
        latestPhotoMetadata,
        "gpsLatitude",
      );
      const latestPhotoLongitude = metadataNumber(
        latestPhotoMetadata,
        "gpsLongitude",
      );

      timeline.push({
        id: `visit-photos-${visit.id}`,
        kind: "photo",
        occurredAt: latestPhoto.createdAt,
        tone: "success",
        title: `${visit.photos.length} evidencia(s) registradas em ${clientName}`,
        description: photoKinds
          ? `Tipos enviados: ${photoKinds}.`
          : "Evidencias visuais do atendimento.",
        photoUrls: timelinePhotos.map((photo) => photo.url),
        photos: timelinePhotos,
        latitude: latestPhotoLatitude,
        longitude: latestPhotoLongitude,
      });
    }

    for (const execution of visit.supplierExecutions) {
      const supplierName =
        execution.supplier.tradeName ?? execution.supplier.name;
      const notes = execution.notes?.trim();
      const needsAttention =
        execution.deliveryReceived === false ||
        execution.stockoutFound === true ||
        Boolean(notes);

      if (!needsAttention) {
        continue;
      }

      const statusLabel =
        execution.deliveryReceived === false
          ? "Sem entrega registrada"
          : execution.stockoutFound === true
            ? "Ruptura informada"
            : "Observacao registrada";

      timeline.push({
        id: `supplier-note-${execution.id}`,
        kind: "supplier_note",
        occurredAt: execution.finishedAtDevice ?? execution.updatedAt,
        tone:
          execution.deliveryReceived === false ||
          execution.stockoutFound === true
            ? "warning"
            : "neutral",
        title: `${statusLabel} - ${supplierName}`,
        description: notes
          ? `Cliente ${clientName}: ${notes}`
          : `Cliente ${clientName} sem justificativa detalhada.`,
      });
    }

    if (visit.status === "completed" && visit.finishedAt) {
      timeline.push({
        id: `visit-finish-${visit.id}`,
        kind: "visit_completed",
        occurredAt: visit.finishedAt,
        tone: "success",
        title: `Atendimento concluido em ${clientName}`,
        description: `Roteiro ${routeName} finalizado pelo promotor.`,
      });
    } else if (visit.status === "in_progress") {
      timeline.push({
        id: `visit-progress-${visit.id}`,
        kind: "visit_started",
        occurredAt: visit.updatedAt,
        tone: "warning",
        title: `Atendimento em andamento em ${clientName}`,
        description: `Promotor ainda em campo neste cliente do roteiro ${routeName}.`,
      });
    }
  }

  return timeline
    .sort(
      (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
    )
    .slice(0, 12);
}

promoterLocationsRouter.get(
  "/live",
  asyncHandler(async (req, res) => {
    if (!req.user || !["ADMIN", "SUPERVISOR"].includes(req.user.role)) {
      throw new AppError(
        403,
        "LIVE_MAP_FORBIDDEN",
        "Only admins and supervisors can view the live map.",
      );
    }

    const today = dayBounds(new Date());
    const supervisorScope =
      req.user.role === "SUPERVISOR"
        ? await prisma.supervisor.findFirst({
            where: { ...scopedCompanyWhere(req), userId: req.user.id },
            select: { id: true },
          })
        : null;

    if (req.user.role === "SUPERVISOR" && !supervisorScope) {
      throw new AppError(
        403,
        "SUPERVISOR_PROFILE_NOT_FOUND",
        "Supervisor autenticado nao possui cadastro operacional.",
      );
    }

    const promoters = await prisma.promoter.findMany({
      where: {
        ...scopedCompanyWhere(req),
        ...(supervisorScope ? { supervisorId: supervisorScope.id } : {}),
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
      orderBy: { code: "asc" },
      include: {
        user: true,
        supervisor: { include: { user: true } },
        locations: {
          where: {
            capturedAt: {
              gte: today.start,
              lte: today.end,
            },
          },
          orderBy: { capturedAt: "desc" },
          take: 20,
        },
        visits: {
          where: {
            OR: [
              {
                startedAt: {
                  gte: today.start,
                  lte: today.end,
                },
              },
              {
                finishedAt: {
                  gte: today.start,
                  lte: today.end,
                },
              },
              {
                createdAt: {
                  gte: today.start,
                  lte: today.end,
                },
              },
            ],
          },
          orderBy: { updatedAt: "desc" },
          take: 8,
          include: {
            client: true,
            route: true,
            photos: {
              orderBy: { createdAt: "desc" },
              take: 6,
              include: {
                supplier: {
                  select: {
                    name: true,
                    tradeName: true,
                  },
                },
                supplierExecution: {
                  include: {
                    supplier: {
                      select: {
                        name: true,
                        tradeName: true,
                      },
                    },
                  },
                },
              },
            },
            supplierExecutions: {
              orderBy: { updatedAt: "desc" },
              include: {
                supplier: {
                  select: {
                    name: true,
                    tradeName: true,
                  },
                },
              },
            },
          },
        },
        routes: {
          where: {
            ...buildRouteWindowWhere(today.start, today.end),
            status: {
              in: ["PUBLISHED", "COMPLETED"],
            },
          },
          orderBy: { scheduledDate: "desc" },
          take: 1,
          include: {
            items: {
              orderBy: { sequence: "asc" },
              include: { client: true },
            },
          },
        },
      },
    });

    res.json({
      data: promoters.map((promoter) => {
        const latestLocation = promoter.locations[0];
        const locationHistory = promoter.locations.map((location) => ({
          latitude: toNumber(location.latitude),
          longitude: toNumber(location.longitude),
          accuracyMeters: toNumber(location.accuracyMeters),
          capturedAt: location.capturedAt,
          receivedAt: location.receivedAt,
        }));
        const activeVisit =
          promoter.visits.find((visit) => visit.status === "in_progress") ??
          null;
        const routeOfDay = promoter.routes[0] ?? null;
        const completedVisits = promoter.visits.filter(
          (visit) => visit.status === "completed",
        ).length;
        const inProgressVisits = promoter.visits.filter(
          (visit) => visit.status === "in_progress",
        ).length;
        const photoCount = promoter.visits.reduce(
          (total, visit) => total + visit.photos.length,
          0,
        );
        const completedRouteClients = routeOfDay
          ? Math.max(
              routeOfDay.items.filter((item) => item.status === "COMPLETED")
                .length,
              promoter.visits.filter(
                (visit) =>
                  visit.status === "completed" &&
                  visit.routeId === routeOfDay.id,
              ).length,
            )
          : 0;
        const nextRouteItem =
          routeOfDay?.items.find((item) => item.status === "PLANNED") ??
          routeOfDay?.items.find((item) => item.status !== "COMPLETED") ??
          null;
        const serviceMinutes = promoter.visits.reduce((total, visit) => {
          if (!visit.startedAt) {
            return total;
          }

          return (
            total +
            visitDurationMinutes(
              visit.startedAt,
              visit.status === "completed" ? visit.finishedAt : null,
            )
          );
        }, 0);
        const timeline = buildTimeline({
          latestLocation: latestLocation
            ? {
                latitude: toNumber(latestLocation.latitude),
                longitude: toNumber(latestLocation.longitude),
                accuracyMeters: toNumber(latestLocation.accuracyMeters),
                capturedAt: latestLocation.capturedAt,
              }
            : null,
          routeOfDay: routeOfDay
            ? {
                id: routeOfDay.id,
                name: routeOfDay.name,
                status: routeOfDay.status,
                scheduledDate: routeOfDay.scheduledDate,
                createdAt: routeOfDay.createdAt,
                items: routeOfDay.items.map((item) => ({
                  id: item.id,
                  status: item.status,
                  client: {
                    name: item.client.name,
                    tradeName: item.client.tradeName,
                  },
                })),
              }
            : null,
          visits: promoter.visits.map((visit) => ({
            id: visit.id,
            status: visit.status,
            startedAt: visit.startedAt,
            finishedAt: visit.finishedAt,
            updatedAt: visit.updatedAt,
            client: {
              name: visit.client.name,
              tradeName: visit.client.tradeName,
            },
            route: visit.route ? { name: visit.route.name } : null,
            photos: visit.photos.map((photo) => ({
              id: photo.id,
              type: photo.type,
              url: photo.url,
              createdAt: photo.createdAt,
              capturedAtDevice: photo.capturedAtDevice,
              metadata: photo.metadata,
              supplier: photo.supplier,
              supplierExecution: photo.supplierExecution,
            })),
            supplierExecutions: visit.supplierExecutions.map((execution) => ({
              id: execution.id,
              status: execution.status,
              deliveryReceived: execution.deliveryReceived,
              stockoutFound: execution.stockoutFound,
              notes: execution.notes,
              startedAtDevice: execution.startedAtDevice,
              finishedAtDevice: execution.finishedAtDevice,
              updatedAt: execution.updatedAt,
              supplier: {
                name: execution.supplier.name,
                tradeName: execution.supplier.tradeName,
              },
            })),
          })),
        });

        return {
          promoter: {
            id: promoter.id,
            code: promoter.code,
            name: promoter.user.name,
            email: promoter.user.email,
            supervisorName: promoter.supervisor?.user.name ?? null,
          },
          activeVisit: activeVisit
            ? {
                id: activeVisit.id,
                clientName: clientDisplayName(activeVisit.client),
                routeName: activeVisit.route?.name ?? null,
                startedAt: activeVisit.startedAt,
              }
            : null,
          activeRoute:
            routeOfDay && routeOfDay.status === "PUBLISHED"
              ? {
                  id: routeOfDay.id,
                  name: routeOfDay.name,
                  scheduledDate: routeOfDay.scheduledDate,
                  nextClientName: nextRouteItem
                    ? clientDisplayName(nextRouteItem.client)
                    : null,
                }
              : null,
          routeOfDay: routeOfDay
            ? {
                id: routeOfDay.id,
                name: routeOfDay.name,
                status: routeOfDay.status,
                scheduledDate: routeOfDay.scheduledDate,
                totalClients: routeOfDay.items.length,
                completedClients: completedRouteClients,
                pendingClients: Math.max(
                  routeOfDay.items.length - completedRouteClients,
                  0,
                ),
                nextClientName: nextRouteItem
                  ? clientDisplayName(nextRouteItem.client)
                  : null,
              }
            : null,
          location: latestLocation
            ? {
                latitude: toNumber(latestLocation.latitude),
                longitude: toNumber(latestLocation.longitude),
                accuracyMeters: toNumber(latestLocation.accuracyMeters),
                capturedAt: latestLocation.capturedAt,
                receivedAt: latestLocation.receivedAt,
                source: latestLocation.source,
              }
            : null,
          locationHistory,
          today: {
            firstSignalAt:
              promoter.locations[promoter.locations.length - 1]?.capturedAt ??
              null,
            lastSignalAt: latestLocation?.capturedAt ?? null,
            signalCount: promoter.locations.length,
            completedVisits,
            inProgressVisits,
            photoCount,
            distanceKm: calculateDistanceKm(locationHistory),
            serviceMinutes,
            routeClients: routeOfDay?.items.length ?? 0,
            completedRouteClients,
          },
          timeline,
          status: locationStatus(latestLocation?.capturedAt ?? null),
        };
      }),
    });
  }),
);

promoterLocationsRouter.post(
  "/heartbeat",
  asyncHandler(async (req, res) => {
    if (!req.user || req.user.role !== "PROMOTOR") {
      throw new AppError(
        403,
        "PROMOTER_LOCATION_FORBIDDEN",
        "Only promoters can send live location heartbeats.",
      );
    }

    const input = locationSchema.parse(req.body);
    const capturedAt = input.capturedAt
      ? new Date(input.capturedAt)
      : new Date();
    const { start, end } = dayBounds(capturedAt);
    const promoter = await prisma.promoter.findUnique({
      where: { userId: req.user.id },
      include: {
        visits: {
          where: {
            status: "in_progress",
            ...(input.visitId ? { id: input.visitId } : {}),
          },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
        routes: {
          where: {
            status: "PUBLISHED",
            ...buildRouteWindowWhere(start, end),
          },
          orderBy: { scheduledDate: "asc" },
          take: 1,
        },
      },
    });

    if (!promoter || promoter.status !== "ACTIVE") {
      throw new AppError(
        404,
        "PROMOTER_NOT_FOUND",
        "Promoter profile was not found.",
      );
    }

    assertSameCompany(req, promoter.companyId);

    const activeVisit = promoter.visits[0];
    const activeRoute = promoter.routes[0];

    if (!activeVisit && !activeRoute) {
      throw new AppError(
        409,
        "ACTIVE_JOURNEY_REQUIRED",
        "Location heartbeat is allowed only during an active visit or a published route scheduled for today.",
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
        source: "mobile",
      },
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
        receivedAt: location.receivedAt,
      },
    });
  }),
);
