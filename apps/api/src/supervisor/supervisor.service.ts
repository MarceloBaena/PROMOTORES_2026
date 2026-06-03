import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditEntityType,
  AlertSeverity,
  Prisma,
  RouteStopStatus,
  UserRole,
} from '@prisma/client';
import { AlertsService } from '../alerts/alerts.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AuditQueryDto,
  AlertsQueryDto,
  DashboardQueryDto,
  EvidenceQueryDto,
  MapQueryDto,
  ReportsQueryDto,
  ResolveAlertDto,
  SyncPendenciesQueryDto,
  TeamQueryDto,
  VisitsQueryDto,
} from './supervisor.dto';

const visitDetailInclude = Prisma.validator<Prisma.VisitInclude>()({
  client: true,
  promoter: {
    select: {
      id: true,
      employeeCode: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
      supervisorUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
  routePlan: {
    select: {
      routeDate: true,
    },
  },
  photos: {
    orderBy: {
      uploadedAt: 'asc',
    },
  },
  checklistResponses: {
    include: {
      template: true,
    },
  },
  statusHistory: {
    orderBy: {
      changedAt: 'asc',
    },
  },
  alerts: {
    orderBy: {
      createdAt: 'desc',
    },
  },
  journey: {
    include: {
      trackPoints: {
        orderBy: {
          capturedAt: 'asc',
        },
      },
    },
  },
});

interface ActorScope {
  userId: string;
  companyId: string;
  role: UserRole;
}

type PromoterStatus = 'ON_ROUTE' | 'DELAYED' | 'READY' | 'IDLE';

@Injectable()
export class SupervisorService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
    private readonly alertsService: AlertsService,
  ) {}

  async getDashboard(actorUserId?: string, query: DashboardQueryDto = {}) {
    await this.ensureOperationalAlertsUpToDate(query.date);
    const [rangeStart, rangeEnd] = this.getDayRange(query.date);
    const promoterIds = await this.getScopedPromoterIds(actorUserId, {
      promoterId: query.promoterId,
      supervisorId: query.supervisorId,
    });

    if (promoterIds.length === 0) {
      return {
        activeJourneys: 0,
        promotersOnRoute: 0,
        plannedVisits: 0,
        completedVisits: 0,
        pendingVisits: 0,
        partialVisits: 0,
        lateVisits: 0,
        openAlerts: 0,
        highAlerts: 0,
        executionRate: 0,
        mapPoints: [],
        alerts: [],
      };
    }

    const now = new Date();
    const [
      activeJourneys,
      plannedVisits,
      completedVisits,
      pendingVisits,
      partialVisits,
      lateVisits,
      openAlerts,
      highAlerts,
      mapData,
      alerts,
    ] = await Promise.all([
      this.prismaService.journey.count({
        where: {
          promoterId: {
            in: promoterIds,
          },
          active: true,
        },
      }),
      this.prismaService.routePlanItem.count({
        where: {
          routePlan: {
            promoterId: {
              in: promoterIds,
            },
            routeDate: {
              gte: rangeStart,
              lt: rangeEnd,
            },
            active: true,
          },
          active: true,
        },
      }),
      this.prismaService.routePlanItem.count({
        where: {
          routePlan: {
            promoterId: {
              in: promoterIds,
            },
            routeDate: {
              gte: rangeStart,
              lt: rangeEnd,
            },
            active: true,
          },
          active: true,
          status: RouteStopStatus.COMPLETED,
        },
      }),
      this.prismaService.routePlanItem.count({
        where: {
          routePlan: {
            promoterId: {
              in: promoterIds,
            },
            routeDate: {
              gte: rangeStart,
              lt: rangeEnd,
            },
            active: true,
          },
          active: true,
          status: {
            in: [
              RouteStopStatus.PLANNED,
              RouteStopStatus.IN_PROGRESS,
              RouteStopStatus.SYNC_PENDING,
            ],
          },
        },
      }),
      this.prismaService.routePlanItem.count({
        where: {
          routePlan: {
            promoterId: {
              in: promoterIds,
            },
            routeDate: {
              gte: rangeStart,
              lt: rangeEnd,
            },
            active: true,
          },
          active: true,
          status: RouteStopStatus.PARTIAL,
        },
      }),
      this.prismaService.routePlanItem.count({
        where: {
          routePlan: {
            promoterId: {
              in: promoterIds,
            },
            routeDate: {
              gte: rangeStart,
              lt: rangeEnd,
            },
            active: true,
          },
          active: true,
          plannedStartAt: {
            lt: now,
          },
          status: {
            in: [
              RouteStopStatus.PLANNED,
              RouteStopStatus.IN_PROGRESS,
              RouteStopStatus.SYNC_PENDING,
            ],
          },
        },
      }),
      this.prismaService.alert.count({
        where: {
          promoterId: {
            in: promoterIds,
          },
          resolvedAt: null,
          createdAt: {
            gte: rangeStart,
            lt: rangeEnd,
          },
        },
      }),
      this.prismaService.alert.count({
        where: {
          promoterId: {
            in: promoterIds,
          },
          severity: AlertSeverity.HIGH,
          resolvedAt: null,
          createdAt: {
            gte: rangeStart,
            lt: rangeEnd,
          },
        },
      }),
      this.getOperationalMap(actorUserId, query),
      this.prismaService.alert.findMany({
        where: {
          promoterId: {
            in: promoterIds,
          },
          createdAt: {
            gte: rangeStart,
            lt: rangeEnd,
          },
        },
        include: {
          promoter: {
            select: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
          client: {
            select: {
              tradeName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
      }),
    ]);

    return {
      activeJourneys,
      promotersOnRoute: activeJourneys,
      plannedVisits,
      completedVisits,
      pendingVisits,
      partialVisits,
      lateVisits,
      openAlerts,
      highAlerts,
      executionRate:
        plannedVisits === 0
          ? 0
          : Number(((completedVisits / plannedVisits) * 100).toFixed(1)),
      mapPoints: mapData.promoters.map((item) => ({
        promoterId: item.promoterId,
        promoterName: item.promoterName,
        journeyId: item.journeyId,
        latitude: item.latitude,
        longitude: item.longitude,
        updatedAt: item.updatedAt,
      })),
      alerts: alerts.map((alert) => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        promoterName: alert.promoter.user.name,
        clientName: alert.client?.tradeName,
        createdAt: alert.createdAt.toISOString(),
      })),
    };
  }

  async getOperationalMap(actorUserId?: string, query: MapQueryDto = {}) {
    await this.ensureOperationalAlertsUpToDate(query.date);
    const [rangeStart, rangeEnd] = this.getDayRange(query.date);
    const promoterWhere = await this.buildPromoterWhere(actorUserId, {
      promoterId: query.promoterId,
      supervisorId: query.supervisorId,
    });
    const now = new Date();
    const promoters = await this.prismaService.promoter.findMany({
      where: promoterWhere,
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        journeys: {
          where: {
            OR: [
              {
                active: true,
              },
              {
                startedAt: {
                  gte: rangeStart,
                  lt: rangeEnd,
                },
              },
            ],
          },
          include: {
            trackPoints: {
              orderBy: {
                capturedAt: 'desc',
              },
              take: 1,
            },
          },
          orderBy: {
            startedAt: 'desc',
          },
          take: 1,
        },
        alerts: {
          where: {
            resolvedAt: null,
            createdAt: {
              gte: rangeStart,
              lt: rangeEnd,
            },
          },
          select: {
            id: true,
          },
        },
        routePlans: {
          where: {
            routeDate: {
              gte: rangeStart,
              lt: rangeEnd,
            },
            active: true,
          },
          include: {
            stops: {
              where: {
                active: true,
              },
              include: {
                client: true,
                visit: {
                  select: {
                    id: true,
                    status: true,
                    completionStatus: true,
                    checkInAt: true,
                    checkOutAt: true,
                    outsideGeofence: true,
                    geofenceDistanceM: true,
                  },
                },
              },
              orderBy: {
                sequence: 'asc',
              },
            },
          },
          take: 1,
        },
      },
      orderBy: {
        user: {
          name: 'asc',
        },
      },
    });

    const promoterItems = promoters
      .map((promoter) => {
        const routePlan = promoter.routePlans[0] ?? null;
        const routeStops = routePlan?.stops ?? [];
        const visibleStops = query.status
          ? routeStops.filter((stop) => stop.status === query.status)
          : routeStops;
        const journey = promoter.journeys[0] ?? null;
        const latestPoint = journey?.trackPoints[0] ?? null;
        const currentStop =
          routeStops.find(
            (stop) =>
              stop.status === RouteStopStatus.IN_PROGRESS ||
              (stop.visit?.checkInAt && !stop.visit?.checkOutAt),
          ) ?? null;
        const nextStop =
          routeStops.find((stop) => stop.status === RouteStopStatus.PLANNED) ??
          null;
        const delayedStops = routeStops.filter((stop) => {
          const delayedStatuses: RouteStopStatus[] = [
            RouteStopStatus.PLANNED,
            RouteStopStatus.IN_PROGRESS,
            RouteStopStatus.SYNC_PENDING,
          ];

          return (
            Boolean(stop.plannedStartAt) &&
            Boolean(stop.plannedStartAt && stop.plannedStartAt < now) &&
            delayedStatuses.includes(stop.status)
          );
        }).length;
        const status = this.getPromoterStatus({
          hasActiveJourney: Boolean(journey?.active),
          delayedStops,
          hasRoutePlan: routeStops.length > 0,
        });
        const fallbackStop = routeStops[0]?.client;

        return {
          promoterId: promoter.id,
          promoterName: promoter.user.name,
          promoterEmail: promoter.user.email,
          journeyId: journey?.id ?? `no-journey-${promoter.id}`,
          status,
          latitude:
            latestPoint?.latitude ??
            journey?.startLatitude ??
            fallbackStop?.latitude ??
            -16.4706,
          longitude:
            latestPoint?.longitude ??
            journey?.startLongitude ??
            fallbackStop?.longitude ??
            -54.6355,
          updatedAt: (
            latestPoint?.capturedAt ??
            journey?.startedAt ??
            routePlan?.routeDate ??
            rangeStart
          ).toISOString(),
          journeyStartedAt: journey?.startedAt.toISOString() ?? null,
          currentCustomerName: currentStop?.client.tradeName ?? null,
          nextCustomerName: nextStop?.client.tradeName ?? null,
          completedVisits: routeStops.filter(
            (stop) => stop.status === RouteStopStatus.COMPLETED,
          ).length,
          delayedVisits: delayedStops,
          openAlerts: promoter.alerts.length,
          routeCustomers: visibleStops.map((stop) => ({
            routeStopId: stop.id,
            visitId: stop.visit?.id ?? null,
            customerId: stop.clientId,
            customerName: stop.client.tradeName,
            latitude: stop.client.latitude,
            longitude: stop.client.longitude,
            status: stop.status,
            completionStatus: stop.visit?.completionStatus ?? null,
            sequence: stop.sequence,
            plannedStartAt: stop.plannedStartAt?.toISOString() ?? null,
            checkedInAt: stop.visit?.checkInAt?.toISOString() ?? null,
            outsideGeofence: stop.visit?.outsideGeofence ?? false,
          })),
        };
      })
      .filter((item) => (query.status ? item.routeCustomers.length > 0 : true));

    return {
      date: rangeStart.toISOString(),
      promoters: promoterItems,
      routeCustomers: promoterItems.flatMap((item) =>
        item.routeCustomers.map((stop) => ({
          ...stop,
          promoterId: item.promoterId,
          promoterName: item.promoterName,
        })),
      ),
    };
  }

  async listTeam(actorUserId: string, query: TeamQueryDto) {
    await this.ensureOperationalAlertsUpToDate(query.date);
    const [rangeStart, rangeEnd] = this.getDayRange(query.date);
    const promoterWhere = await this.buildPromoterWhere(actorUserId, {
      promoterId: query.promoterId,
      supervisorId: query.supervisorId,
      search: query.search,
    });
    const now = new Date();
    const promoters = await this.prismaService.promoter.findMany({
      where: promoterWhere,
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        alerts: {
          where: {
            resolvedAt: null,
            createdAt: {
              gte: rangeStart,
              lt: rangeEnd,
            },
          },
          select: {
            id: true,
          },
        },
        journeys: {
          where: {
            OR: [
              {
                active: true,
              },
              {
                startedAt: {
                  gte: rangeStart,
                  lt: rangeEnd,
                },
              },
            ],
          },
          orderBy: {
            startedAt: 'desc',
          },
          take: 1,
        },
        routePlans: {
          where: {
            routeDate: {
              gte: rangeStart,
              lt: rangeEnd,
            },
            active: true,
          },
          include: {
            stops: {
              where: {
                active: true,
              },
              include: {
                client: {
                  select: {
                    tradeName: true,
                  },
                },
                visit: {
                  select: {
                    id: true,
                    checkInAt: true,
                    checkOutAt: true,
                  },
                },
              },
              orderBy: {
                sequence: 'asc',
              },
            },
          },
          take: 1,
        },
      },
      orderBy: {
        user: {
          name: 'asc',
        },
      },
    });

    const items = promoters
      .map((promoter) => {
        const routePlan = promoter.routePlans[0] ?? null;
        const stops = routePlan?.stops ?? [];
        const currentStop =
          stops.find(
            (stop) => stop.visit?.checkInAt && !stop.visit?.checkOutAt,
          ) ?? null;
        const nextStop =
          stops.find((stop) => stop.status === RouteStopStatus.PLANNED) ?? null;
        const completedVisits = stops.filter(
          (stop) => stop.status === RouteStopStatus.COMPLETED,
        ).length;
        const delayedStops = stops.filter((stop) => {
          const delayedStatuses: RouteStopStatus[] = [
            RouteStopStatus.PLANNED,
            RouteStopStatus.IN_PROGRESS,
            RouteStopStatus.SYNC_PENDING,
          ];

          return (
            Boolean(stop.plannedStartAt) &&
            Boolean(stop.plannedStartAt && stop.plannedStartAt < now) &&
            delayedStatuses.includes(stop.status)
          );
        }).length;
        const status = this.getPromoterStatus({
          hasActiveJourney: Boolean(promoter.journeys[0]?.active),
          delayedStops,
          hasRoutePlan: stops.length > 0,
        });

        return {
          promoterId: promoter.id,
          promoterName: promoter.user.name,
          promoterEmail: promoter.user.email,
          employeeCode: promoter.employeeCode,
          status,
          journeyStartedAt:
            promoter.journeys[0]?.startedAt.toISOString() ?? null,
          currentCustomerName: currentStop?.client.tradeName ?? null,
          nextCustomerName: nextStop?.client.tradeName ?? null,
          visitsCompleted: completedVisits,
          totalStops: stops.length,
          delays: delayedStops,
          openAlerts: promoter.alerts.length,
        };
      })
      .filter((item) => (query.status ? item.status === query.status : true));

    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const sliced = items.slice((page - 1) * pageSize, page * pageSize);

    return {
      page,
      pageSize,
      total: items.length,
      items: sliced,
    };
  }

  async listVisits(actorUserId: string, query: VisitsQueryDto) {
    await this.ensureOperationalAlertsUpToDate(query.date);
    const [rangeStart, rangeEnd] = this.getDayRange(query.date);
    const promoterIds = await this.getScopedPromoterIds(actorUserId, {
      promoterId: query.promoterId,
      supervisorId: query.supervisorId,
    });

    if (promoterIds.length === 0) {
      return {
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        total: 0,
        items: [],
      };
    }

    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const direction = query.sortDirection ?? 'desc';
    const orderBy: Prisma.RoutePlanItemOrderByWithRelationInput =
      query.sortBy === 'status'
        ? { status: direction }
        : query.sortBy === 'sequence'
          ? { sequence: direction }
          : { plannedStartAt: direction };

    const where: Prisma.RoutePlanItemWhereInput = {
      active: true,
      routePlan: {
        promoterId: {
          in: promoterIds,
        },
        routeDate: {
          gte: rangeStart,
          lt: rangeEnd,
        },
        active: true,
      },
      clientId: query.customerId,
      status: query.status,
      visit: query.completionStatus
        ? {
            is: {
              completionStatus: query.completionStatus,
            },
          }
        : undefined,
      OR: query.search
        ? [
            {
              client: {
                tradeName: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            },
            {
              routePlan: {
                promoter: {
                  user: {
                    name: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            },
          ]
        : undefined,
    };

    const [total, items] = await Promise.all([
      this.prismaService.routePlanItem.count({ where }),
      this.prismaService.routePlanItem.findMany({
        where,
        include: {
          client: {
            select: {
              tradeName: true,
            },
          },
          routePlan: {
            select: {
              promoter: {
                select: {
                  user: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
          visit: {
            include: {
              photos: true,
              alerts: {
                where: {
                  resolvedAt: null,
                },
                select: {
                  id: true,
                },
              },
            },
          },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map((item) => {
        const beforePhotosCount =
          item.visit?.photos.filter(
            (photo) =>
              photo.type === 'BEFORE' &&
              photo.category !== 'CHECKIN_ESTABLISHMENT',
          ).length ?? 0;
        const afterPhotosCount =
          item.visit?.photos.filter((photo) => photo.type === 'AFTER').length ??
          0;

        return {
          id: item.visit?.id ?? item.id,
          routeStopId: item.id,
          visitId: item.visit?.id ?? null,
          status: item.status,
          completionStatus: item.visit?.completionStatus ?? null,
          clientName: item.client.tradeName,
          promoterName: item.routePlan.promoter.user.name,
          plannedStartAt: item.plannedStartAt?.toISOString() ?? null,
          plannedEndAt: item.plannedEndAt?.toISOString() ?? null,
          checkInAt: item.visit?.checkInAt.toISOString() ?? null,
          checkOutAt: item.visit?.checkOutAt?.toISOString() ?? null,
          beforePhotosCount,
          afterPhotosCount,
          geofenceDistanceM: item.visit?.geofenceDistanceM ?? null,
          outsideGeofence: item.visit?.outsideGeofence ?? false,
          notes: item.visit?.notes ?? item.notes ?? null,
          evidenceComplete: beforePhotosCount > 0 && afterPhotosCount > 0,
          alertsOpen: item.visit?.alerts.length ?? 0,
        };
      }),
    };
  }

  async getVisitDetails(actorUserId: string, visitId: string) {
    const promoterIds = await this.getScopedPromoterIds(actorUserId);
    let visit = await this.prismaService.visit.findFirst({
      where: {
        id: visitId,
        promoterId: {
          in: promoterIds,
        },
      },
      include: visitDetailInclude,
    });

    if (!visit) {
      throw new NotFoundException('Visita nao encontrada');
    }

    await this.ensureOperationalAlertsUpToDate(
      visit.routePlan.routeDate.toISOString(),
    );

    visit =
      (await this.prismaService.visit.findFirst({
        where: {
          id: visitId,
          promoterId: {
            in: promoterIds,
          },
        },
        include: visitDetailInclude,
      })) ?? visit;

    const currentStop = await this.prismaService.routePlanItem.findUnique({
      where: {
        id: visit.routeStopId,
      },
      select: {
        sequence: true,
      },
    });

    const nextStop = currentStop
      ? await this.prismaService.routePlanItem.findFirst({
          where: {
            routePlanId: visit.routePlanId,
            active: true,
            sequence: {
              gt: currentStop.sequence,
            },
          },
          select: {
            id: true,
            clientId: true,
            sequence: true,
            plannedStartAt: true,
            client: {
              select: {
                tradeName: true,
              },
            },
            visit: {
              select: {
                id: true,
              },
            },
          },
          orderBy: {
            sequence: 'asc',
          },
        })
      : null;

    const auditTrail = await this.prismaService.auditLog.findMany({
      where: {
        OR: [
          {
            entityType: 'VISIT',
            entityId: visitId,
          },
          {
            entityType: 'PHOTO',
            payload: {
              path: ['visitId'],
              equals: visitId,
            },
          },
        ],
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return {
      id: visit.id,
      routeDate: visit.routePlan.routeDate.toISOString(),
      routeStopId: visit.routeStopId,
      sequence: currentStop?.sequence ?? null,
      status: visit.status,
      completionStatus: visit.completionStatus,
      outsideGeofence: visit.outsideGeofence,
      geofenceDistanceM: visit.geofenceDistanceM,
      outsideGeofenceJustification: visit.outsideGeofenceJustification,
      notes: visit.notes,
      checkInAt: visit.checkInAt.toISOString(),
      checkOutAt: visit.checkOutAt?.toISOString(),
      promoter: {
        id: visit.promoter.id,
        employeeCode: visit.promoter.employeeCode,
        name: visit.promoter.user.name,
        email: visit.promoter.user.email,
      },
      supervisor: visit.promoter.supervisorUser
        ? {
            id: visit.promoter.supervisorUser.id,
            name: visit.promoter.supervisorUser.name,
            email: visit.promoter.supervisorUser.email,
          }
        : null,
      client: visit.client,
      photos: visit.photos.map((photo) => ({
        id: photo.id,
        type: photo.type,
        category: photo.category,
        url: photo.publicUrl,
        capturedAt: photo.capturedAt.toISOString(),
      })),
      checklist: [...visit.checklistResponses]
        .sort(
          (left, right) => left.template.sortOrder - right.template.sortOrder,
        )
        .map((response) => ({
          code: response.template.code,
          label: response.template.label,
          type: response.template.type,
          required: response.template.required,
          value:
            response.template.type === 'BOOLEAN'
              ? Boolean(response.valueBoolean)
              : (response.valueText ?? ''),
        })),
      statusHistory: visit.statusHistory.map((item) => ({
        previousStatus: item.previousStatus,
        nextStatus: item.nextStatus,
        previousCompletionStatus: item.previousCompletionStatus,
        nextCompletionStatus: item.nextCompletionStatus,
        note: item.note,
        changedAt: item.changedAt.toISOString(),
      })),
      alerts: visit.alerts.map((alert) => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        createdAt: alert.createdAt.toISOString(),
        resolvedAt: alert.resolvedAt?.toISOString(),
        resolutionNote: alert.resolutionNote,
      })),
      trackPoints: visit.journey.trackPoints.map((point) => ({
        id: point.id,
        latitude: point.latitude,
        longitude: point.longitude,
        capturedAt: point.capturedAt.toISOString(),
      })),
      nextVisit: nextStop
        ? {
            routeStopId: nextStop.id,
            visitId: nextStop.visit?.id ?? null,
            customerId: nextStop.clientId,
            customerName: nextStop.client.tradeName,
            sequence: nextStop.sequence,
            plannedStartAt: nextStop.plannedStartAt?.toISOString() ?? null,
          }
        : null,
      auditTrail: auditTrail.map((item) => ({
        id: item.id,
        entityType: item.entityType,
        action: item.action,
        payload: item.payload,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  async listAlerts(actorUserId: string, query: AlertsQueryDto) {
    await this.ensureOperationalAlertsUpToDate(query.date);
    const [rangeStart, rangeEnd] = this.getDayRange(query.date);
    const promoterIds = await this.getScopedPromoterIds(actorUserId, {
      promoterId: query.promoterId,
    });
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);

    if (promoterIds.length === 0) {
      return {
        page,
        pageSize,
        total: 0,
        items: [],
      };
    }

    const where: Prisma.AlertWhereInput = {
      promoterId: {
        in: promoterIds,
      },
      createdAt: {
        gte: rangeStart,
        lt: rangeEnd,
      },
      severity: query.severity,
      type: query.type,
      resolvedAt:
        query.resolved === undefined
          ? undefined
          : query.resolved
            ? {
                not: null,
              }
            : null,
    };

    const [total, items] = await Promise.all([
      this.prismaService.alert.count({ where }),
      this.prismaService.alert.findMany({
        where,
        include: {
          promoter: {
            select: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
          client: {
            select: {
              tradeName: true,
            },
          },
          visit: {
            select: {
              id: true,
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map((alert) => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        active: alert.active,
        promoterName: alert.promoter.user.name,
        clientName: alert.client?.tradeName,
        visitId: alert.visit?.id,
        visitStatus: alert.visit?.status,
        createdAt: alert.createdAt.toISOString(),
        resolvedAt: alert.resolvedAt?.toISOString(),
        resolutionNote: alert.resolutionNote,
      })),
    };
  }

  async resolveAlert(
    actorUserId: string,
    alertId: string,
    body: ResolveAlertDto,
  ) {
    const promoterIds = await this.getScopedPromoterIds(actorUserId);
    const alert = await this.prismaService.alert.findFirst({
      where: {
        id: alertId,
        promoterId: {
          in: promoterIds,
        },
      },
    });

    if (!alert) {
      throw new NotFoundException('Alerta nao encontrado');
    }

    const updated = await this.prismaService.alert.update({
      where: {
        id: alertId,
      },
      data: {
        active: false,
        resolvedAt: new Date(),
        resolutionNote: body.note?.trim() || null,
      },
    });

    await this.auditService.record(
      actorUserId,
      AuditEntityType.ALERT,
      alertId,
      'alert.resolved',
      {
        previousResolvedAt: alert.resolvedAt?.toISOString() ?? null,
        resolutionNote: body.note?.trim() || null,
      },
    );

    return {
      id: updated.id,
      resolvedAt: updated.resolvedAt?.toISOString() ?? null,
      resolutionNote: updated.resolutionNote,
      active: updated.active,
    };
  }

  async listEvidences(actorUserId: string, query: EvidenceQueryDto) {
    await this.ensureOperationalAlertsUpToDate(query.date);
    const [rangeStart, rangeEnd] = this.getDayRange(query.date);
    const promoterIds = await this.getScopedPromoterIds(actorUserId, {
      promoterId: query.promoterId,
      supervisorId: query.supervisorId,
    });
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);

    if (promoterIds.length === 0) {
      return {
        page,
        pageSize,
        total: 0,
        items: [],
      };
    }

    const where: Prisma.VisitWhereInput = {
      promoterId: {
        in: promoterIds,
      },
      checkInAt: {
        gte: rangeStart,
        lt: rangeEnd,
      },
      clientId: query.customerId,
      photos: {
        some: query.type
          ? {
              type: query.type,
            }
          : {},
      },
      OR: query.search
        ? [
            {
              client: {
                tradeName: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            },
            {
              promoter: {
                user: {
                  name: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
            },
          ]
        : undefined,
    };

    const [total, items] = await Promise.all([
      this.prismaService.visit.count({ where }),
      this.prismaService.visit.findMany({
        where,
        include: {
          client: {
            select: {
              tradeName: true,
            },
          },
          promoter: {
            select: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
          photos: {
            where: query.type
              ? {
                  type: query.type,
                }
              : undefined,
            orderBy: {
              capturedAt: 'asc',
            },
          },
        },
        orderBy: {
          checkInAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map((visit) => {
        const beforePhotos = visit.photos.filter(
          (photo) =>
            photo.type === 'BEFORE' &&
            photo.category !== 'CHECKIN_ESTABLISHMENT',
        );
        const afterPhotos = visit.photos.filter(
          (photo) => photo.type === 'AFTER',
        );

        return {
          visitId: visit.id,
          clientName: visit.client.tradeName,
          promoterName: visit.promoter.user.name,
          checkInAt: visit.checkInAt.toISOString(),
          checkOutAt: visit.checkOutAt?.toISOString() ?? null,
          evidenceComplete: beforePhotos.length > 0 && afterPhotos.length > 0,
          beforePhotos: beforePhotos.map((photo) => ({
            id: photo.id,
            type: photo.type,
            category: photo.category,
            url: photo.publicUrl,
            capturedAt: photo.capturedAt.toISOString(),
          })),
          afterPhotos: afterPhotos.map((photo) => ({
            id: photo.id,
            type: photo.type,
            category: photo.category,
            url: photo.publicUrl,
            capturedAt: photo.capturedAt.toISOString(),
          })),
        };
      }),
    };
  }

  async getReports(actorUserId: string, query: ReportsQueryDto) {
    await this.ensureOperationalAlertsUpToDate(query.date);
    const [rangeStart, rangeEnd] = this.getDayRange(query.date);
    const promoterIds = await this.getScopedPromoterIds(actorUserId, {
      promoterId: query.promoterId,
      supervisorId: query.supervisorId,
    });

    if (promoterIds.length === 0) {
      return {
        date: rangeStart.toISOString(),
        summary: {
          planned: 0,
          completed: 0,
          partial: 0,
          notDone: 0,
          outsideGeofenceCheckIns: 0,
          evidenceCompletionRate: 0,
        },
        promoterProductivity: [],
        unattendedCustomers: [],
        outsideGeofenceVisits: [],
      };
    }

    const [routeStops, visits] = await Promise.all([
      this.prismaService.routePlanItem.findMany({
        where: {
          active: true,
          routePlan: {
            promoterId: {
              in: promoterIds,
            },
            routeDate: {
              gte: rangeStart,
              lt: rangeEnd,
            },
            active: true,
          },
        },
        include: {
          client: {
            select: {
              id: true,
              tradeName: true,
            },
          },
          routePlan: {
            select: {
              promoterId: true,
              promoter: {
                select: {
                  user: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prismaService.visit.findMany({
        where: {
          promoterId: {
            in: promoterIds,
          },
          checkInAt: {
            gte: rangeStart,
            lt: rangeEnd,
          },
        },
        include: {
          client: {
            select: {
              id: true,
              tradeName: true,
            },
          },
          promoter: {
            select: {
              id: true,
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
          photos: true,
        },
      }),
    ]);

    const planned = routeStops.length;
    const completed = routeStops.filter(
      (stop) => stop.status === RouteStopStatus.COMPLETED,
    ).length;
    const partial = routeStops.filter(
      (stop) => stop.status === RouteStopStatus.PARTIAL,
    ).length;
    const notDoneStatuses: RouteStopStatus[] = [
      RouteStopStatus.NOT_DONE,
      RouteStopStatus.PLANNED,
    ];
    const notDone = routeStops.filter((stop) =>
      notDoneStatuses.includes(stop.status),
    ).length;
    const outsideGeofenceVisits = visits.filter(
      (visit) => visit.outsideGeofence,
    );
    const evidenceCompleteVisits = visits.filter((visit) => {
      const hasBefore = visit.photos.some((photo) => photo.type === 'BEFORE');
      const hasAfter = visit.photos.some((photo) => photo.type === 'AFTER');
      return hasBefore && hasAfter;
    });

    const productivityByPromoter = new Map<
      string,
      {
        promoterId: string;
        promoterName: string;
        planned: number;
        completed: number;
        partial: number;
        notDone: number;
      }
    >();

    routeStops.forEach((stop) => {
      const promoterId = stop.routePlan.promoterId;
      const current = productivityByPromoter.get(promoterId) ?? {
        promoterId,
        promoterName: stop.routePlan.promoter.user.name,
        planned: 0,
        completed: 0,
        partial: 0,
        notDone: 0,
      };

      current.planned += 1;

      if (stop.status === RouteStopStatus.COMPLETED) {
        current.completed += 1;
      } else if (stop.status === RouteStopStatus.PARTIAL) {
        current.partial += 1;
      } else if (
        stop.status === RouteStopStatus.NOT_DONE ||
        stop.status === RouteStopStatus.PLANNED
      ) {
        current.notDone += 1;
      }

      productivityByPromoter.set(promoterId, current);
    });

    return {
      date: rangeStart.toISOString(),
      summary: {
        planned,
        completed,
        partial,
        notDone,
        outsideGeofenceCheckIns: outsideGeofenceVisits.length,
        evidenceCompletionRate:
          visits.length === 0
            ? 0
            : Number(
                ((evidenceCompleteVisits.length / visits.length) * 100).toFixed(
                  1,
                ),
              ),
      },
      promoterProductivity: [...productivityByPromoter.values()].map(
        (item) => ({
          ...item,
          executionRate:
            item.planned === 0
              ? 0
              : Number(((item.completed / item.planned) * 100).toFixed(1)),
        }),
      ),
      unattendedCustomers: routeStops
        .filter((stop) => notDoneStatuses.includes(stop.status))
        .map((stop) => ({
          routeStopId: stop.id,
          customerId: stop.client.id,
          customerName: stop.client.tradeName,
          promoterId: stop.routePlan.promoterId,
          promoterName: stop.routePlan.promoter.user.name,
          plannedStartAt: stop.plannedStartAt?.toISOString() ?? null,
          status: stop.status,
        })),
      outsideGeofenceVisits: outsideGeofenceVisits.map((visit) => ({
        visitId: visit.id,
        clientName: visit.client.tradeName,
        promoterName: visit.promoter.user.name,
        geofenceDistanceM: visit.geofenceDistanceM,
        checkInAt: visit.checkInAt.toISOString(),
      })),
    };
  }

  async listAuditLogs(actorUserId: string, query: AuditQueryDto) {
    const [rangeStart, rangeEnd] = this.getDayRange(query.date);
    const scope = await this.getActorScope(actorUserId);

    if (!scope) {
      return {
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        total: 0,
        items: [],
      };
    }

    const promoterIds = await this.getScopedPromoterIds(actorUserId, {
      promoterId: query.promoterId,
      supervisorId: query.supervisorId,
    });

    const customerWhere: Prisma.CustomerWhereInput =
      scope.role === UserRole.SUPERVISOR
        ? {
            companyId: scope.companyId,
            deletedAt: null,
            OR: [
              {
                defaultPromoterUserId: {
                  in: promoterIds,
                },
              },
              {
                supervisorUserId: scope.userId,
              },
            ],
          }
        : {
            companyId: scope.companyId,
            deletedAt: null,
          };

    const [
      customerIds,
      routePlanIds,
      routeStopIds,
      journeyIds,
      visitIds,
      photoIds,
      alertIds,
      teamIds,
      teamMemberIds,
    ] = await Promise.all([
      this.prismaService.customer
        .findMany({
          where: customerWhere,
          select: {
            id: true,
          },
        })
        .then((items) => items.map((item) => item.id)),
      this.prismaService.routePlan
        .findMany({
          where: {
            promoterId: {
              in: promoterIds,
            },
            routeDate: {
              gte: rangeStart,
              lt: rangeEnd,
            },
            active: true,
          },
          select: {
            id: true,
          },
        })
        .then((items) => items.map((item) => item.id)),
      this.prismaService.routePlanItem
        .findMany({
          where: {
            routePlan: {
              promoterId: {
                in: promoterIds,
              },
              routeDate: {
                gte: rangeStart,
                lt: rangeEnd,
              },
              active: true,
            },
            active: true,
          },
          select: {
            id: true,
          },
        })
        .then((items) => items.map((item) => item.id)),
      this.prismaService.journey
        .findMany({
          where: {
            promoterId: {
              in: promoterIds,
            },
            startedAt: {
              gte: rangeStart,
              lt: rangeEnd,
            },
          },
          select: {
            id: true,
          },
        })
        .then((items) => items.map((item) => item.id)),
      this.prismaService.visit
        .findMany({
          where: {
            promoterId: {
              in: promoterIds,
            },
            checkInAt: {
              gte: rangeStart,
              lt: rangeEnd,
            },
          },
          select: {
            id: true,
          },
        })
        .then((items) => items.map((item) => item.id)),
      this.prismaService.visitPhoto
        .findMany({
          where: {
            promoterId: {
              in: promoterIds,
            },
            capturedAt: {
              gte: rangeStart,
              lt: rangeEnd,
            },
          },
          select: {
            id: true,
          },
        })
        .then((items) => items.map((item) => item.id)),
      this.prismaService.alert
        .findMany({
          where: {
            promoterId: {
              in: promoterIds,
            },
            createdAt: {
              gte: rangeStart,
              lt: rangeEnd,
            },
          },
          select: {
            id: true,
          },
        })
        .then((items) => items.map((item) => item.id)),
      this.prismaService.team
        .findMany({
          where:
            scope.role === UserRole.SUPERVISOR
              ? {
                  companyId: scope.companyId,
                  supervisorUserId: scope.userId,
                  active: true,
                }
              : {
                  companyId: scope.companyId,
                  active: true,
                },
          select: {
            id: true,
          },
        })
        .then((items) => items.map((item) => item.id)),
      this.prismaService.teamMember
        .findMany({
          where: {
            team:
              scope.role === UserRole.SUPERVISOR
                ? {
                    companyId: scope.companyId,
                    supervisorUserId: scope.userId,
                    active: true,
                  }
                : {
                    companyId: scope.companyId,
                    active: true,
                  },
          },
          select: {
            id: true,
          },
        })
        .then((items) => items.map((item) => item.id)),
    ]);

    const impossibleId = '__none__';
    const scopedWhere: Prisma.AuditLogWhereInput = {
      OR: [
        {
          actorUser: {
            companyId: scope.companyId,
          },
        },
        {
          entityType: AuditEntityType.PROMOTER,
          entityId: {
            in: promoterIds.length > 0 ? promoterIds : [impossibleId],
          },
        },
        {
          entityType: AuditEntityType.CUSTOMER,
          entityId: {
            in: customerIds.length > 0 ? customerIds : [impossibleId],
          },
        },
        {
          entityType: AuditEntityType.ROUTE_PLAN,
          entityId: {
            in: routePlanIds.length > 0 ? routePlanIds : [impossibleId],
          },
        },
        {
          entityType: AuditEntityType.ROUTE_PLAN_ITEM,
          entityId: {
            in: routeStopIds.length > 0 ? routeStopIds : [impossibleId],
          },
        },
        {
          entityType: AuditEntityType.JOURNEY,
          entityId: {
            in: journeyIds.length > 0 ? journeyIds : [impossibleId],
          },
        },
        {
          entityType: AuditEntityType.VISIT,
          entityId: {
            in: visitIds.length > 0 ? visitIds : [impossibleId],
          },
        },
        {
          entityType: AuditEntityType.PHOTO,
          entityId: {
            in: photoIds.length > 0 ? photoIds : [impossibleId],
          },
        },
        {
          entityType: AuditEntityType.ALERT,
          entityId: {
            in: alertIds.length > 0 ? alertIds : [impossibleId],
          },
        },
        {
          entityType: AuditEntityType.TEAM,
          entityId: {
            in: teamIds.length > 0 ? teamIds : [impossibleId],
          },
        },
        {
          entityType: AuditEntityType.TEAM_MEMBER,
          entityId: {
            in: teamMemberIds.length > 0 ? teamMemberIds : [impossibleId],
          },
        },
      ],
    };

    const where: Prisma.AuditLogWhereInput = {
      createdAt: {
        gte: rangeStart,
        lt: rangeEnd,
      },
      entityType: query.entityType,
      action: query.action
        ? {
            contains: query.action,
            mode: 'insensitive',
          }
        : undefined,
      AND: query.search
        ? [
            {
              OR: [
                {
                  action: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
                {
                  entityId: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
                {
                  actorUser: {
                    name: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                },
                {
                  actorUser: {
                    email: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                },
              ],
            },
          ]
        : undefined,
      ...scopedWhere,
    };

    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);

    const [total, items] = await Promise.all([
      this.prismaService.auditLog.count({ where }),
      this.prismaService.auditLog.findMany({
        where,
        include: {
          actorUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map((item) => ({
        id: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        action: item.action,
        actorUserId: item.actorUserId,
        actorName: item.actorUser?.name ?? 'Sistema',
        actorEmail: item.actorUser?.email ?? null,
        actorRole: item.actorUser?.role ?? null,
        payload: item.payload,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  async listSyncPendencies(actorUserId: string, query: SyncPendenciesQueryDto) {
    await this.ensureOperationalAlertsUpToDate(query.date);
    const [rangeStart, rangeEnd] = this.getDayRange(query.date);
    const promoterIds = await this.getScopedPromoterIds(actorUserId, {
      promoterId: query.promoterId,
      supervisorId: query.supervisorId,
      search: query.search,
    });
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);

    if (promoterIds.length === 0) {
      return {
        page,
        pageSize,
        total: 0,
        items: [],
      };
    }

    const where: Prisma.RoutePlanItemWhereInput = {
      active: true,
      clientId: query.customerId,
      status: query.status ?? {
        in: [RouteStopStatus.SYNC_PENDING, RouteStopStatus.IN_PROGRESS],
      },
      routePlan: {
        promoterId: {
          in: promoterIds,
        },
        routeDate: {
          gte: rangeStart,
          lt: rangeEnd,
        },
        active: true,
      },
      OR: query.search
        ? [
            {
              client: {
                tradeName: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            },
            {
              routePlan: {
                promoter: {
                  user: {
                    name: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            },
          ]
        : undefined,
    };

    const [total, items] = await Promise.all([
      this.prismaService.routePlanItem.count({ where }),
      this.prismaService.routePlanItem.findMany({
        where,
        include: {
          client: {
            select: {
              tradeName: true,
            },
          },
          routePlan: {
            select: {
              promoterId: true,
              promoter: {
                select: {
                  user: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
          visit: {
            include: {
              photos: {
                select: {
                  type: true,
                  category: true,
                },
              },
              checklistResponses: {
                select: {
                  id: true,
                },
              },
              alerts: {
                where: {
                  resolvedAt: null,
                },
                select: {
                  id: true,
                  type: true,
                },
              },
            },
          },
        },
        orderBy: [
          {
            status: 'desc',
          },
          {
            plannedStartAt: 'asc',
          },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map((item) => {
        const beforePhotosCount =
          item.visit?.photos.filter(
            (photo) =>
              photo.type === 'BEFORE' &&
              photo.category !== 'CHECKIN_ESTABLISHMENT',
          ).length ?? 0;
        const afterPhotosCount =
          item.visit?.photos.filter((photo) => photo.type === 'AFTER').length ??
          0;

        return {
          routeStopId: item.id,
          visitId: item.visit?.id ?? null,
          status: item.status,
          promoterId: item.routePlan.promoterId,
          promoterName: item.routePlan.promoter.user.name,
          customerId: item.clientId,
          customerName: item.client.tradeName,
          sequence: item.sequence,
          plannedStartAt: item.plannedStartAt?.toISOString() ?? null,
          checkInAt: item.visit?.checkInAt?.toISOString() ?? null,
          checkOutAt: item.visit?.checkOutAt?.toISOString() ?? null,
          outsideGeofence: item.visit?.outsideGeofence ?? false,
          geofenceDistanceM: item.visit?.geofenceDistanceM ?? null,
          beforePhotosCount,
          afterPhotosCount,
          checklistSubmitted: (item.visit?.checklistResponses.length ?? 0) > 0,
          openAlerts: item.visit?.alerts.length ?? 0,
          pendingReason:
            item.status === RouteStopStatus.SYNC_PENDING
              ? 'Visita aguardando consolidacao e fechamento de sincronizacao'
              : 'Atendimento em andamento e ainda nao concluido',
          notes: item.visit?.notes ?? item.notes ?? null,
        };
      }),
    };
  }

  private async buildPromoterWhere(
    actorUserId?: string,
    filters?: {
      promoterId?: string;
      supervisorId?: string;
      search?: string;
    },
  ) {
    const scope = await this.getActorScope(actorUserId);
    return {
      id: filters?.promoterId,
      companyId: scope?.companyId,
      deletedAt: null,
      active: true,
      supervisorId:
        scope?.role === UserRole.SUPERVISOR
          ? scope.userId
          : filters?.supervisorId,
      user: {
        active: true,
        deletedAt: null,
        OR: filters?.search
          ? [
              {
                name: {
                  contains: filters.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                email: {
                  contains: filters.search,
                  mode: 'insensitive' as const,
                },
              },
            ]
          : undefined,
      },
    };
  }

  private async getScopedPromoterIds(
    actorUserId?: string,
    filters?: {
      promoterId?: string;
      supervisorId?: string;
      search?: string;
    },
  ) {
    const where = await this.buildPromoterWhere(actorUserId, filters);
    const promoters = await this.prismaService.promoter.findMany({
      where,
      select: {
        id: true,
      },
    });
    return promoters.map((promoter) => promoter.id);
  }

  private async getActorScope(
    actorUserId?: string,
  ): Promise<ActorScope | null> {
    if (!actorUserId) {
      return null;
    }

    const actor = await this.prismaService.user.findUnique({
      where: {
        id: actorUserId,
      },
      select: {
        id: true,
        companyId: true,
        role: true,
      },
    });

    if (!actor) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    return {
      userId: actor.id,
      companyId: actor.companyId,
      role: actor.role,
    };
  }

  private getPromoterStatus(input: {
    hasActiveJourney: boolean;
    delayedStops: number;
    hasRoutePlan: boolean;
  }): PromoterStatus {
    if (input.hasActiveJourney) {
      return 'ON_ROUTE';
    }

    if (input.delayedStops > 0) {
      return 'DELAYED';
    }

    if (input.hasRoutePlan) {
      return 'READY';
    }

    return 'IDLE';
  }

  private getDayRange(reference?: string) {
    const date = reference ? new Date(reference) : new Date();
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return [start, end] as const;
  }

  private async ensureOperationalAlertsUpToDate(referenceDate?: string) {
    await this.alertsService.reconcileOperationalAlerts(
      referenceDate ? new Date(referenceDate) : new Date(),
    );
  }
}
