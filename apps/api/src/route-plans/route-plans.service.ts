import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditEntityType,
  NotificationType,
  CustomerStatus,
  Prisma,
  RouteChangeType,
  RouteItemPriority,
  RoutePlanStatus,
  RoutePlanningViewMode,
  RouteRecurrencePattern,
  RouteStopStatus,
  ScheduleDayOfWeek,
  TeamStatus,
  UserRole,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ApplyRouteTemplateDto,
  BatchUpsertRoutePlansDto,
  ListPromoterNotificationsQueryDto,
  ListRoutePlansQueryDto,
  ListRouteTemplatesQueryDto,
  PublishRoutePlanDto,
  RoutePlanItemDto,
  RouteTemplateItemDto,
  UpsertRoutePlanDto,
  UpsertRouteTemplateDto,
} from './route-plans.dto';

interface ActorScope {
  userId: string;
  companyId: string;
  role: UserRole;
}

interface NormalizedPlanItem {
  routePlanItemId?: string;
  customerId: string;
  sequence: number;
  priority: RouteItemPriority;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  notes: string | null;
}

interface NormalizedTemplateItem {
  routeTemplateItemId?: string;
  customerId: string;
  sequence: number;
  priority: RouteItemPriority;
  plannedStartTime: string | null;
  plannedEndTime: string | null;
  dayOfWeek: ScheduleDayOfWeek | null;
  dayOfMonth: number | null;
  notes: string | null;
}

type TransactionClient = Prisma.TransactionClient;

const ACTIVE_STOP_STATUSES: RouteStopStatus[] = [
  RouteStopStatus.PLANNED,
  RouteStopStatus.IN_PROGRESS,
  RouteStopStatus.SYNC_PENDING,
];

@Injectable()
export class RoutePlansService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  listPlansForDate(referenceDate = new Date()) {
    const [start, end] = this.getDayRange(referenceDate);

    return this.prismaService.routePlan.findMany({
      where: {
        active: true,
        routeDate: {
          gte: start,
          lt: end,
        },
      },
      include: {
        promoter: {
          include: {
            user: true,
          },
        },
        stops: {
          where: {
            active: true,
          },
          include: {
            client: true,
          },
          orderBy: {
            sequence: 'asc',
          },
        },
      },
      orderBy: {
        routeDate: 'asc',
      },
    });
  }

  findPromoterPlanForDate(promoterId: string, referenceDate = new Date()) {
    const [start, end] = this.getDayRange(referenceDate);

    return this.prismaService.routePlan.findFirst({
      where: {
        promoterId,
        active: true,
        routeDate: {
          gte: start,
          lt: end,
        },
      },
      include: {
        promoter: {
          include: {
            user: true,
          },
        },
        stops: {
          where: {
            active: true,
          },
          include: {
            client: true,
          },
          orderBy: {
            sequence: 'asc',
          },
        },
      },
    });
  }

  async listRoutePlans(actorUserId: string, query: ListRoutePlansQueryDto) {
    const scope = await this.getActorScope(actorUserId);
    const { rangeStart, rangeEnd, view } = this.resolveRouteQueryRange(query);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const promoterWhere = this.buildPromoterWhere(scope, query.promoterId);
    const where: Prisma.RoutePlanWhereInput = {
      companyId: scope.companyId,
      active: true,
      routeDate: {
        gte: rangeStart,
        lt: rangeEnd,
      },
      promoter: promoterWhere,
      status: query.status,
      templateId: query.templateId,
      OR: query.search
        ? [
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
            {
              notes: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
            {
              template: {
                name: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            },
            {
              stops: {
                some: {
                  active: true,
                  client: {
                    tradeName: {
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

    const [total, plans] = await Promise.all([
      this.prismaService.routePlan.count({ where }),
      this.prismaService.routePlan.findMany({
        where,
        include: {
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
            },
          },
          template: {
            select: {
              id: true,
              name: true,
              recurrence: true,
            },
          },
          stops: {
            include: {
              client: {
                select: {
                  id: true,
                  tradeName: true,
                },
              },
              visit: {
                select: {
                  id: true,
                  status: true,
                  completionStatus: true,
                },
              },
            },
            orderBy: {
              sequence: 'asc',
            },
          },
        },
        orderBy: [
          { routeDate: 'asc' },
          { promoter: { user: { name: 'asc' } } },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      view,
      dateFrom: rangeStart.toISOString(),
      dateTo: new Date(rangeEnd.getTime() - 1).toISOString(),
      items: plans.map((plan) => {
        const activeStops = plan.stops.filter((stop) => stop.active);
        const completedStops = activeStops.filter(
          (stop) => stop.status === RouteStopStatus.COMPLETED,
        ).length;
        const partialStops = activeStops.filter(
          (stop) => stop.status === RouteStopStatus.PARTIAL,
        ).length;
        const pendingStops = activeStops.filter((stop) =>
          ACTIVE_STOP_STATUSES.includes(stop.status),
        ).length;
        const urgentStops = activeStops.filter(
          (stop) =>
            stop.priority === RouteItemPriority.HIGH ||
            stop.priority === RouteItemPriority.URGENT,
        ).length;

        return {
          id: plan.id,
          routeDate: plan.routeDate.toISOString(),
          planningView: plan.planningView,
          promoterId: plan.promoterId,
          promoterName: plan.promoter.user.name,
          promoterEmail: plan.promoter.user.email,
          employeeCode: plan.promoter.employeeCode,
          status: plan.status,
          version: plan.version,
          publishedAt: plan.publishedAt?.toISOString() ?? null,
          updatedAt: plan.updatedAt.toISOString(),
          notes: plan.notes,
          template: plan.template
            ? {
                id: plan.template.id,
                name: plan.template.name,
                recurrence: plan.template.recurrence,
              }
            : null,
          totalStops: activeStops.length,
          completedStops,
          partialStops,
          pendingStops,
          cancelledStops: plan.stops.filter((stop) => !stop.active).length,
          urgentStops,
          nextInstruction: this.buildNextInstruction(activeStops),
          stops: activeStops.map((stop) => ({
            id: stop.id,
            customerId: stop.clientId,
            customerName: stop.client.tradeName,
            sequence: stop.sequence,
            priority: stop.priority,
            plannedStartAt: stop.plannedStartAt?.toISOString() ?? null,
            plannedEndAt: stop.plannedEndAt?.toISOString() ?? null,
            status: stop.status,
            notes: stop.notes,
            visitId: stop.visit?.id ?? null,
            completionStatus: stop.visit?.completionStatus ?? null,
          })),
        };
      }),
    };
  }

  async getRoutePlanDetails(actorUserId: string, routePlanId: string) {
    const scope = await this.getActorScope(actorUserId);
    const plan = await this.prismaService.routePlan.findFirst({
      where: {
        id: routePlanId,
        companyId: scope.companyId,
        active: true,
        promoter: this.buildPromoterWhere(scope),
      },
      include: {
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
          },
        },
        template: {
          select: {
            id: true,
            name: true,
            recurrence: true,
          },
        },
        stops: {
          include: {
            client: true,
            visit: {
              select: {
                id: true,
                status: true,
                completionStatus: true,
                checkInAt: true,
                checkOutAt: true,
              },
            },
            cancelledByUser: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            sequence: 'asc',
          },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('Roteiro nao encontrado');
    }

    return {
      id: plan.id,
      routeDate: plan.routeDate.toISOString(),
      planningView: plan.planningView,
      version: plan.version,
      status: plan.status,
      publishedAt: plan.publishedAt?.toISOString() ?? null,
      updatedAt: plan.updatedAt.toISOString(),
      notes: plan.notes,
      template: plan.template
        ? {
            id: plan.template.id,
            name: plan.template.name,
            recurrence: plan.template.recurrence,
          }
        : null,
      promoter: {
        id: plan.promoter.id,
        name: plan.promoter.user.name,
        email: plan.promoter.user.email,
        employeeCode: plan.promoter.employeeCode,
      },
      nextInstruction: this.buildNextInstruction(
        plan.stops.filter((stop) => stop.active),
      ),
      stops: plan.stops.map((stop) => ({
        id: stop.id,
        active: stop.active,
        customerId: stop.clientId,
        customerName: stop.client.tradeName,
        address: stop.client.address,
        city: stop.client.city,
        state: stop.client.state,
        latitude: stop.client.latitude,
        longitude: stop.client.longitude,
        geofenceRadiusM: stop.client.geofenceRadiusM,
        sequence: stop.sequence,
        priority: stop.priority,
        plannedStartAt: stop.plannedStartAt?.toISOString() ?? null,
        plannedEndAt: stop.plannedEndAt?.toISOString() ?? null,
        status: stop.status,
        notes: stop.notes,
        visitId: stop.visit?.id ?? null,
        completionStatus: stop.visit?.completionStatus ?? null,
        checkInAt: stop.visit?.checkInAt?.toISOString() ?? null,
        checkOutAt: stop.visit?.checkOutAt?.toISOString() ?? null,
        cancelledAt: stop.cancelledAt?.toISOString() ?? null,
        cancellationReason: stop.cancellationReason ?? null,
        cancelledBy: stop.cancelledByUser
          ? {
              id: stop.cancelledByUser.id,
              name: stop.cancelledByUser.name,
            }
          : null,
      })),
    };
  }

  async createRoutePlan(actorUserId: string, dto: UpsertRoutePlanDto) {
    const scope = await this.getActorScope(actorUserId);
    this.validateUpsertPayload(scope, dto);

    const promoter = await this.assertPromoterAccess(scope, dto.promoterId);
    const routeDate = this.parseRouteCalendarDate(dto.routeDate);
    await this.ensureUniqueRoutePlan(
      scope.companyId,
      dto.promoterId,
      routeDate,
    );
    const normalizedItems = await this.normalizePlanItems(
      scope.companyId,
      dto.items,
    );
    const nextStatus = this.resolveNextPlanStatus(
      undefined,
      dto.status,
      dto.publishNow,
    );
    const publishedAt = this.shouldPublish(nextStatus) ? new Date() : null;

    const created = await this.prismaService.$transaction(
      async (transaction) => {
        const plan = await transaction.routePlan.create({
          data: {
            companyId: scope.companyId,
            routeDate,
            promoterId: dto.promoterId,
            planningView: dto.planningView ?? RoutePlanningViewMode.DAILY,
            supervisorUserId: promoter.supervisorId ?? actorUserId,
            templateId: dto.sourceTemplateId ?? null,
            status: nextStatus,
            version: 1,
            publishedAt,
            lastPublishedByUserId: publishedAt ? actorUserId : null,
            notes: dto.notes?.trim() || null,
            active: true,
          },
        });

        for (const item of normalizedItems) {
          const createdStop = await transaction.routePlanItem.create({
            data: {
              routePlanId: plan.id,
              clientId: item.customerId,
              sequence: item.sequence,
              priority: item.priority,
              plannedStartAt: item.plannedStartAt,
              plannedEndAt: item.plannedEndAt,
              notes: item.notes,
              active: true,
            },
            include: {
              client: {
                select: {
                  tradeName: true,
                },
              },
            },
          });

          await this.createRouteChangeLog(transaction, {
            companyId: scope.companyId,
            routePlanId: plan.id,
            routePlanItemId: createdStop.id,
            actorUserId,
            changeType: RouteChangeType.ITEM_ADDED,
            summary: `Cliente ${createdStop.client.tradeName} incluido na sequencia ${createdStop.sequence}.`,
            nextSnapshot: this.serializePlanItemForLog(createdStop),
          });
        }

        await this.createRouteChangeLog(transaction, {
          companyId: scope.companyId,
          routePlanId: plan.id,
          actorUserId,
          changeType: RouteChangeType.PLAN_CREATED,
          summary: `Roteiro criado para ${routeDate.toISOString().slice(0, 10)} com ${normalizedItems.length} cliente(s).`,
          nextSnapshot: {
            routeDate: routeDate.toISOString(),
            planningView: dto.planningView ?? RoutePlanningViewMode.DAILY,
            status: nextStatus,
            itemsCount: normalizedItems.length,
          },
        });

        if (publishedAt) {
          await this.createPromoterNotification(transaction, {
            companyId: scope.companyId,
            recipientUserId: dto.promoterId,
            routePlanId: plan.id,
            type: NotificationType.ROUTE_PUBLISHED,
            title: 'Roteiro publicado',
            message: `Seu roteiro de ${routeDate.toISOString().slice(0, 10)} foi publicado com ${normalizedItems.length} parada(s).`,
            payload: {
              routeDate: routeDate.toISOString(),
              version: 1,
            },
          });
        }

        return plan;
      },
    );

    await this.auditService.record(
      actorUserId,
      AuditEntityType.ROUTE_PLAN,
      created.id,
      'route_plan.created',
      {
        promoterId: dto.promoterId,
        routeDate: routeDate.toISOString(),
        itemsCount: normalizedItems.length,
        status: nextStatus,
      },
    );

    return this.getRoutePlanDetails(actorUserId, created.id);
  }

  async createRoutePlansBatch(
    actorUserId: string,
    dto: BatchUpsertRoutePlansDto,
  ) {
    const scope = await this.getActorScope(actorUserId);
    this.validateBatchPayload(scope, dto);
    await this.assertPromoterAccess(scope, dto.promoterId);

    const dates = this.resolveBatchDates(dto);
    const results: Array<{
      id: string;
      routeDate: string;
      action: 'created' | 'updated';
    }> = [];

    for (const routeDate of dates) {
      const existing = await this.prismaService.routePlan.findFirst({
        where: {
          companyId: scope.companyId,
          promoterId: dto.promoterId,
          routeDate,
          active: true,
        },
        select: {
          id: true,
        },
      });

      const payload: UpsertRoutePlanDto = {
        routeDate: routeDate.toISOString(),
        promoterId: dto.promoterId,
        planningView:
          dto.planningView ??
          this.inferPlanningViewFromRange(dto.startDate, dto.endDate),
        status: dto.status,
        sourceTemplateId: dto.sourceTemplateId,
        publishNow: dto.publishNow,
        notes: dto.notes,
        items: dto.items,
      };

      if (existing) {
        const plan = await this.updateRoutePlan(
          actorUserId,
          existing.id,
          payload,
        );
        results.push({
          id: plan.id,
          routeDate: plan.routeDate,
          action: 'updated',
        });
        continue;
      }

      const plan = await this.createRoutePlan(actorUserId, payload);
      results.push({
        id: plan.id,
        routeDate: plan.routeDate,
        action: 'created',
      });
    }

    return {
      count: results.length,
      createdCount: results.filter((item) => item.action === 'created').length,
      updatedCount: results.filter((item) => item.action === 'updated').length,
      items: results,
    };
  }

  async updateRoutePlan(
    actorUserId: string,
    routePlanId: string,
    dto: UpsertRoutePlanDto,
  ) {
    const scope = await this.getActorScope(actorUserId);
    const existing = await this.prismaService.routePlan.findFirst({
      where: {
        id: routePlanId,
        companyId: scope.companyId,
        active: true,
        promoter: this.buildPromoterWhere(scope),
      },
      include: {
        visits: {
          select: {
            id: true,
          },
          take: 1,
        },
        stops: {
          include: {
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
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Roteiro nao encontrado');
    }

    this.validateUpsertPayload(scope, dto);
    const promoter = await this.assertPromoterAccess(scope, dto.promoterId);
    const routeDate = this.parseRouteCalendarDate(dto.routeDate);

    if (
      existing.visits.length > 0 &&
      (existing.promoterId !== dto.promoterId ||
        existing.routeDate.getTime() !== routeDate.getTime())
    ) {
      throw new ConflictException(
        'Nao e seguro mover de data ou trocar o promotor de um roteiro que ja possui visitas registradas',
      );
    }

    await this.ensureUniqueRoutePlan(
      scope.companyId,
      dto.promoterId,
      routeDate,
      routePlanId,
    );
    const normalizedItems = await this.normalizePlanItems(
      scope.companyId,
      dto.items,
    );
    const nextStatus = this.resolveNextPlanStatus(
      existing.status,
      dto.status,
      dto.publishNow,
    );
    const shouldNotify = this.shouldPublish(nextStatus);
    const publicationMoment = shouldNotify ? new Date() : existing.publishedAt;
    const existingStopsById = new Map(
      existing.stops.map((stop) => [stop.id, stop]),
    );
    const existingActiveStopsByCustomer = new Map(
      existing.stops
        .filter((stop) => stop.active)
        .map((stop) => [stop.clientId, stop]),
    );

    const result = await this.prismaService.$transaction(
      async (transaction) => {
        const updatedPlan = await transaction.routePlan.update({
          where: {
            id: routePlanId,
          },
          data: {
            routeDate,
            promoterId: dto.promoterId,
            planningView: dto.planningView ?? existing.planningView,
            supervisorUserId: promoter.supervisorId ?? actorUserId,
            templateId: dto.sourceTemplateId ?? existing.templateId,
            status: nextStatus,
            version: {
              increment: 1,
            },
            publishedAt: publicationMoment,
            lastPublishedByUserId: shouldNotify
              ? actorUserId
              : existing.lastPublishedByUserId,
            notes: dto.notes?.trim() || null,
          },
          select: {
            id: true,
            version: true,
          },
        });

        const referenceIds = new Set<string>();
        let addedCount = 0;
        let updatedCount = 0;
        let cancelledCount = 0;

        for (const item of normalizedItems) {
          const matchedStop =
            (item.routePlanItemId
              ? existingStopsById.get(item.routePlanItemId)
              : undefined) ??
            existingActiveStopsByCustomer.get(item.customerId);

          if (matchedStop) {
            if (item.customerId !== matchedStop.clientId) {
              throw new BadRequestException(
                'Nao e permitido trocar o cliente de um item ja existente. Remova e inclua novamente.',
              );
            }

            referenceIds.add(matchedStop.id);
            const { data, logs } = this.buildRoutePlanItemUpdate(
              matchedStop,
              item,
            );

            if (Object.keys(data).length > 0) {
              await transaction.routePlanItem.update({
                where: {
                  id: matchedStop.id,
                },
                data,
              });

              for (const log of logs) {
                await this.createRouteChangeLog(transaction, {
                  companyId: scope.companyId,
                  routePlanId,
                  routePlanItemId: matchedStop.id,
                  actorUserId,
                  changeType: log.changeType,
                  summary: log.summary,
                  previousSnapshot: log.previousSnapshot,
                  nextSnapshot: log.nextSnapshot,
                });
              }

              updatedCount += 1;
            }

            continue;
          }

          const createdStop = await transaction.routePlanItem.create({
            data: {
              routePlanId,
              clientId: item.customerId,
              sequence: item.sequence,
              priority: item.priority,
              plannedStartAt: item.plannedStartAt,
              plannedEndAt: item.plannedEndAt,
              notes: item.notes,
              active: true,
            },
            include: {
              client: {
                select: {
                  tradeName: true,
                },
              },
            },
          });

          await this.createRouteChangeLog(transaction, {
            companyId: scope.companyId,
            routePlanId,
            routePlanItemId: createdStop.id,
            actorUserId,
            changeType: RouteChangeType.ITEM_ADDED,
            summary: `Cliente ${createdStop.client.tradeName} incluido na sequencia ${createdStop.sequence}.`,
            nextSnapshot: this.serializePlanItemForLog(createdStop),
          });

          addedCount += 1;
        }

        for (const stop of existing.stops.filter((item) => item.active)) {
          if (referenceIds.has(stop.id)) {
            continue;
          }

          await transaction.routePlanItem.update({
            where: {
              id: stop.id,
            },
            data: {
              active: false,
              cancelledAt: new Date(),
              cancelledByUserId: actorUserId,
              cancellationReason: 'Removido do roteiro pelo supervisor.',
            },
          });

          await this.createRouteChangeLog(transaction, {
            companyId: scope.companyId,
            routePlanId,
            routePlanItemId: stop.id,
            actorUserId,
            changeType: RouteChangeType.ITEM_CANCELLED,
            summary: `Cliente ${stop.client.tradeName} removido do roteiro.`,
            previousSnapshot: this.serializePlanItemForLog(stop),
            nextSnapshot: {
              id: stop.id,
              clientId: stop.clientId,
              sequence: stop.sequence,
              priority: stop.priority,
              plannedStartAt: stop.plannedStartAt?.toISOString() ?? null,
              plannedEndAt: stop.plannedEndAt?.toISOString() ?? null,
              notes: stop.notes ?? null,
              active: false,
              cancelledAt: new Date().toISOString(),
              cancellationReason: 'Removido do roteiro pelo supervisor.',
            },
          });

          cancelledCount += 1;
        }

        await this.createRouteChangeLog(transaction, {
          companyId: scope.companyId,
          routePlanId,
          actorUserId,
          changeType: RouteChangeType.PLAN_UPDATED,
          summary: `Roteiro atualizado: ${addedCount} inclusao(oes), ${updatedCount} ajuste(s) e ${cancelledCount} cancelamento(s).`,
          metadata: {
            addedCount,
            updatedCount,
            cancelledCount,
            nextVersion: updatedPlan.version,
          },
        });

        if (shouldNotify) {
          await this.createPromoterNotification(transaction, {
            companyId: scope.companyId,
            recipientUserId: dto.promoterId,
            routePlanId,
            type: dto.publishNow
              ? NotificationType.ROUTE_PUBLISHED
              : NotificationType.ROUTE_UPDATED,
            title: dto.publishNow
              ? 'Roteiro republicado'
              : 'Roteiro atualizado',
            message: this.buildRouteUpdateNotificationMessage(routeDate, {
              addedCount,
              updatedCount,
              cancelledCount,
            }),
            payload: {
              routeDate: routeDate.toISOString(),
              version: updatedPlan.version,
              addedCount,
              updatedCount,
              cancelledCount,
            },
          });
        }

        return {
          version: updatedPlan.version,
          addedCount,
          updatedCount,
          cancelledCount,
        };
      },
    );

    await this.auditService.record(
      actorUserId,
      AuditEntityType.ROUTE_PLAN,
      routePlanId,
      'route_plan.updated',
      {
        promoterId: dto.promoterId,
        routeDate: routeDate.toISOString(),
        itemsCount: normalizedItems.length,
        version: result.version,
        addedCount: result.addedCount,
        updatedCount: result.updatedCount,
        cancelledCount: result.cancelledCount,
      },
    );

    return this.getRoutePlanDetails(actorUserId, routePlanId);
  }

  async publishRoutePlan(
    actorUserId: string,
    routePlanId: string,
    dto: PublishRoutePlanDto,
  ) {
    const scope = await this.getActorScope(actorUserId);
    const existing = await this.prismaService.routePlan.findFirst({
      where: {
        id: routePlanId,
        companyId: scope.companyId,
        active: true,
        promoter: this.buildPromoterWhere(scope),
      },
      select: {
        id: true,
        companyId: true,
        promoterId: true,
        routeDate: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Roteiro nao encontrado');
    }

    await this.prismaService.$transaction(async (transaction) => {
      const updated = await transaction.routePlan.update({
        where: {
          id: routePlanId,
        },
        data: {
          status: RoutePlanStatus.PUBLISHED,
          version: {
            increment: 1,
          },
          publishedAt: new Date(),
          lastPublishedByUserId: actorUserId,
        },
        select: {
          version: true,
        },
      });

      await this.createRouteChangeLog(transaction, {
        companyId: scope.companyId,
        routePlanId,
        actorUserId,
        changeType: RouteChangeType.PLAN_PUBLISHED,
        summary:
          dto.note?.trim() ||
          `Roteiro publicado para ${existing.routeDate.toISOString().slice(0, 10)}.`,
        metadata: {
          nextVersion: updated.version,
        },
      });

      await this.createPromoterNotification(transaction, {
        companyId: scope.companyId,
        recipientUserId: existing.promoterId,
        routePlanId,
        type: NotificationType.ROUTE_PUBLISHED,
        title: 'Nova publicacao de roteiro',
        message:
          dto.note?.trim() ||
          `O supervisor publicou uma nova versao do roteiro de ${existing.routeDate.toISOString().slice(0, 10)}.`,
        payload: {
          routeDate: existing.routeDate.toISOString(),
          version: updated.version,
        },
      });
    });

    await this.auditService.record(
      actorUserId,
      AuditEntityType.ROUTE_PLAN,
      routePlanId,
      'route_plan.published',
      {
        note: dto.note?.trim() || null,
      },
    );

    return this.getRoutePlanDetails(actorUserId, routePlanId);
  }

  async getRoutePlanHistory(actorUserId: string, routePlanId: string) {
    const scope = await this.getActorScope(actorUserId);
    const plan = await this.prismaService.routePlan.findFirst({
      where: {
        id: routePlanId,
        companyId: scope.companyId,
        active: true,
        promoter: this.buildPromoterWhere(scope),
      },
      select: {
        id: true,
      },
    });

    if (!plan) {
      throw new NotFoundException('Roteiro nao encontrado');
    }

    const items = await this.prismaService.routeChangeLog.findMany({
      where: {
        routePlanId,
      },
      include: {
        actorUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    return {
      routePlanId,
      total: items.length,
      items: items.map((item) => ({
        id: item.id,
        changeType: item.changeType,
        summary: item.summary,
        previousSnapshot: item.previousSnapshot,
        nextSnapshot: item.nextSnapshot,
        metadata: item.metadata,
        actor: item.actorUser
          ? {
              id: item.actorUser.id,
              name: item.actorUser.name,
              email: item.actorUser.email,
            }
          : null,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  async archiveRoutePlan(actorUserId: string, routePlanId: string) {
    const scope = await this.getActorScope(actorUserId);
    const existing = await this.prismaService.routePlan.findFirst({
      where: {
        id: routePlanId,
        companyId: scope.companyId,
        active: true,
        promoter: this.buildPromoterWhere(scope),
      },
      include: {
        visits: {
          select: {
            id: true,
          },
          take: 1,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Roteiro nao encontrado');
    }

    if (existing.visits.length > 0) {
      throw new ConflictException(
        'Nao e seguro arquivar um roteiro que ja possui visitas registradas',
      );
    }

    await this.prismaService.$transaction(async (transaction) => {
      await transaction.routePlan.update({
        where: {
          id: routePlanId,
        },
        data: {
          active: false,
          status: RoutePlanStatus.ARCHIVED,
        },
      });

      await transaction.routePlanItem.updateMany({
        where: {
          routePlanId,
          active: true,
        },
        data: {
          active: false,
          cancelledAt: new Date(),
          cancelledByUserId: actorUserId,
          cancellationReason: 'Roteiro arquivado.',
        },
      });

      await this.createRouteChangeLog(transaction, {
        companyId: scope.companyId,
        routePlanId,
        actorUserId,
        changeType: RouteChangeType.PLAN_UPDATED,
        summary: 'Roteiro arquivado pelo supervisor.',
      });
    });

    await this.auditService.record(
      actorUserId,
      AuditEntityType.ROUTE_PLAN,
      routePlanId,
      'route_plan.archived',
      {},
    );

    return {
      id: routePlanId,
      archived: true,
    };
  }

  async listRouteTemplates(
    actorUserId: string,
    query: ListRouteTemplatesQueryDto,
  ) {
    const scope = await this.getActorScope(actorUserId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.RouteTemplateWhereInput = {
      companyId: scope.companyId,
      promoter: this.buildPromoterWhere(scope, query.promoterId),
      recurrence: query.recurrence,
      OR: query.search
        ? [
            {
              name: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
            {
              description: {
                contains: query.search,
                mode: 'insensitive',
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

    const [total, templates] = await Promise.all([
      this.prismaService.routeTemplate.count({ where }),
      this.prismaService.routeTemplate.findMany({
        where,
        include: {
          promoter: {
            select: {
              id: true,
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
          items: {
            where: {
              active: true,
            },
            select: {
              id: true,
            },
          },
        },
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: templates.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        recurrence: template.recurrence,
        promoterId: template.promoterId,
        promoterName: template.promoter.user.name,
        promoterEmail: template.promoter.user.email,
        weekdays: template.weekdays,
        monthDays: template.monthDays,
        effectiveFrom: template.effectiveFrom?.toISOString() ?? null,
        effectiveUntil: template.effectiveUntil?.toISOString() ?? null,
        active: template.active,
        itemsCount: template.items.length,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      })),
    };
  }

  async getRouteTemplateDetails(actorUserId: string, routeTemplateId: string) {
    const scope = await this.getActorScope(actorUserId);
    const template = await this.prismaService.routeTemplate.findFirst({
      where: {
        id: routeTemplateId,
        companyId: scope.companyId,
        promoter: this.buildPromoterWhere(scope),
      },
      include: {
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
          },
        },
        items: {
          where: {
            active: true,
          },
          include: {
            customer: {
              select: {
                id: true,
                tradeName: true,
                address: true,
                city: true,
                state: true,
              },
            },
          },
          orderBy: {
            sequence: 'asc',
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Modelo de roteiro nao encontrado');
    }

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      recurrence: template.recurrence,
      weekdays: template.weekdays,
      monthDays: template.monthDays,
      effectiveFrom: template.effectiveFrom?.toISOString() ?? null,
      effectiveUntil: template.effectiveUntil?.toISOString() ?? null,
      active: template.active,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      promoter: {
        id: template.promoter.id,
        name: template.promoter.user.name,
        email: template.promoter.user.email,
        employeeCode: template.promoter.employeeCode,
      },
      items: template.items.map((item) => ({
        id: item.id,
        customerId: item.customerId,
        customerName: item.customer.tradeName,
        address: item.customer.address,
        city: item.customer.city,
        state: item.customer.state,
        sequence: item.sequence,
        priority: item.priority,
        plannedStartTime: item.plannedStartTime,
        plannedEndTime: item.plannedEndTime,
        dayOfWeek: item.dayOfWeek,
        dayOfMonth: item.dayOfMonth,
        notes: item.notes,
      })),
    };
  }

  async createRouteTemplate(actorUserId: string, dto: UpsertRouteTemplateDto) {
    const scope = await this.getActorScope(actorUserId);
    this.validateTemplatePayload(scope, dto);
    await this.assertPromoterAccess(scope, dto.promoterId);
    const normalizedItems = await this.normalizeTemplateItems(
      scope.companyId,
      dto.items,
    );

    const created = await this.prismaService.routeTemplate.create({
      data: {
        companyId: scope.companyId,
        promoterId: dto.promoterId,
        supervisorUserId: actorUserId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        recurrence: dto.recurrence,
        weekdays: dto.weekdays ?? [],
        monthDays: [...new Set(dto.monthDays ?? [])].sort(
          (left, right) => left - right,
        ),
        effectiveFrom: dto.effectiveFrom
          ? this.parseRouteCalendarDate(dto.effectiveFrom)
          : null,
        effectiveUntil: dto.effectiveUntil
          ? this.parseRouteCalendarDate(dto.effectiveUntil)
          : null,
        active: dto.active ?? true,
        items: {
          create: normalizedItems.map((item) => ({
            customerId: item.customerId,
            sequence: item.sequence,
            priority: item.priority,
            plannedStartTime: item.plannedStartTime,
            plannedEndTime: item.plannedEndTime,
            dayOfWeek: item.dayOfWeek,
            dayOfMonth: item.dayOfMonth,
            notes: item.notes,
            active: true,
          })),
        },
      },
    });

    return this.getRouteTemplateDetails(actorUserId, created.id);
  }

  async updateRouteTemplate(
    actorUserId: string,
    routeTemplateId: string,
    dto: UpsertRouteTemplateDto,
  ) {
    const scope = await this.getActorScope(actorUserId);
    this.validateTemplatePayload(scope, dto);
    await this.assertPromoterAccess(scope, dto.promoterId);
    const normalizedItems = await this.normalizeTemplateItems(
      scope.companyId,
      dto.items,
    );

    const existing = await this.prismaService.routeTemplate.findFirst({
      where: {
        id: routeTemplateId,
        companyId: scope.companyId,
        promoter: this.buildPromoterWhere(scope),
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Modelo de roteiro nao encontrado');
    }

    await this.prismaService.$transaction(async (transaction) => {
      await transaction.routeTemplate.update({
        where: {
          id: routeTemplateId,
        },
        data: {
          promoterId: dto.promoterId,
          supervisorUserId: actorUserId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          recurrence: dto.recurrence,
          weekdays: dto.weekdays ?? [],
          monthDays: [...new Set(dto.monthDays ?? [])].sort(
            (left, right) => left - right,
          ),
          effectiveFrom: dto.effectiveFrom
            ? this.parseRouteCalendarDate(dto.effectiveFrom)
            : null,
          effectiveUntil: dto.effectiveUntil
            ? this.parseRouteCalendarDate(dto.effectiveUntil)
            : null,
          active: dto.active ?? true,
        },
      });

      await transaction.routeTemplateItem.deleteMany({
        where: {
          routeTemplateId,
        },
      });

      if (normalizedItems.length > 0) {
        await transaction.routeTemplateItem.createMany({
          data: normalizedItems.map((item) => ({
            routeTemplateId,
            customerId: item.customerId,
            sequence: item.sequence,
            priority: item.priority,
            plannedStartTime: item.plannedStartTime,
            plannedEndTime: item.plannedEndTime,
            dayOfWeek: item.dayOfWeek,
            dayOfMonth: item.dayOfMonth,
            notes: item.notes,
            active: true,
          })),
        });
      }
    });

    return this.getRouteTemplateDetails(actorUserId, routeTemplateId);
  }

  async applyRouteTemplate(
    actorUserId: string,
    routeTemplateId: string,
    dto: ApplyRouteTemplateDto,
  ) {
    const scope = await this.getActorScope(actorUserId);
    const template = await this.prismaService.routeTemplate.findFirst({
      where: {
        id: routeTemplateId,
        companyId: scope.companyId,
        active: true,
        promoter: this.buildPromoterWhere(scope),
      },
      include: {
        items: {
          where: {
            active: true,
          },
          orderBy: {
            sequence: 'asc',
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Modelo de roteiro nao encontrado');
    }

    const targetDates = this.resolveTemplateTargetDates(template, dto);
    const items: Array<{
      id: string;
      routeDate: string;
      action: 'created' | 'updated';
    }> = [];

    for (const targetDate of targetDates) {
      const itemsForDate = this.materializeTemplateItemsForDate(
        template,
        targetDate,
      );

      if (itemsForDate.length === 0) {
        continue;
      }

      const existingPlan = await this.prismaService.routePlan.findFirst({
        where: {
          companyId: scope.companyId,
          promoterId: template.promoterId,
          routeDate: targetDate,
          active: true,
        },
        select: {
          id: true,
        },
      });

      const publishNow = dto.publishNow ?? true;
      const payload: UpsertRoutePlanDto = {
        routeDate: targetDate.toISOString(),
        promoterId: template.promoterId,
        planningView: this.toPlanningView(template.recurrence),
        status: publishNow ? RoutePlanStatus.PUBLISHED : RoutePlanStatus.DRAFT,
        sourceTemplateId: template.id,
        publishNow,
        notes: template.description ?? undefined,
        items: itemsForDate,
      };

      if (existingPlan) {
        const updated = await this.updateRoutePlan(
          actorUserId,
          existingPlan.id,
          payload,
        );
        items.push({
          id: updated.id,
          routeDate: updated.routeDate,
          action: 'updated',
        });
        continue;
      }

      const created = await this.createRoutePlan(actorUserId, payload);
      items.push({
        id: created.id,
        routeDate: created.routeDate,
        action: 'created',
      });
    }

    return {
      routeTemplateId,
      count: items.length,
      createdCount: items.filter((item) => item.action === 'created').length,
      updatedCount: items.filter((item) => item.action === 'updated').length,
      items,
    };
  }

  async listPromoterNotifications(
    userId: string,
    query: ListPromoterNotificationsQueryDto,
  ) {
    const actor = await this.getActorScope(userId);
    const limit = Math.min(query.limit ?? 20, 100);
    const notifications = await this.prismaService.notification.findMany({
      where: {
        companyId: actor.companyId,
        recipientUserId: userId,
        readAt: query.unreadOnly ? null : undefined,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return {
      total: notifications.length,
      items: notifications.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        message: item.message,
        routePlanId: item.routePlanId,
        routePlanItemId: item.routePlanItemId,
        payload: item.payload,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  async markNotificationAsRead(userId: string, notificationId: string) {
    const actor = await this.getActorScope(userId);
    const existing = await this.prismaService.notification.findFirst({
      where: {
        id: notificationId,
        companyId: actor.companyId,
        recipientUserId: userId,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Notificacao nao encontrada');
    }

    await this.prismaService.notification.update({
      where: {
        id: notificationId,
      },
      data: {
        readAt: new Date(),
      },
    });

    return {
      id: notificationId,
      read: true,
    };
  }

  private async getActorScope(actorUserId: string): Promise<ActorScope> {
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

  private buildPromoterWhere(scope: ActorScope, promoterId?: string) {
    return {
      id: promoterId,
      companyId: scope.companyId,
      deletedAt: null,
      active: true,
      user: {
        active: true,
        deletedAt: null,
      },
      supervisorId:
        scope.role === UserRole.SUPERVISOR ? scope.userId : undefined,
    };
  }

  private async assertPromoterAccess(scope: ActorScope, promoterId: string) {
    const promoter = await this.prismaService.promoter.findFirst({
      where: this.buildPromoterWhere(scope, promoterId),
      select: {
        id: true,
        supervisorId: true,
        teamMembership: {
          select: {
            team: {
              select: {
                id: true,
                name: true,
                status: true,
                active: true,
              },
            },
          },
        },
      },
    });

    if (!promoter) {
      throw new NotFoundException('Promotor nao encontrado para este contexto');
    }

    if (
      promoter.teamMembership?.team &&
      (!promoter.teamMembership.team.active ||
        promoter.teamMembership.team.status !== TeamStatus.ACTIVE)
    ) {
      throw new BadRequestException(
        `O promotor pertence a equipe inativa ${promoter.teamMembership.team.name} e nao pode receber novo roteiro.`,
      );
    }

    return promoter;
  }

  private async ensureUniqueRoutePlan(
    companyId: string,
    promoterId: string,
    routeDate: Date,
    ignoreId?: string,
  ) {
    const existing = await this.prismaService.routePlan.findFirst({
      where: {
        companyId,
        promoterId,
        routeDate,
        active: true,
        id: ignoreId
          ? {
              not: ignoreId,
            }
          : undefined,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Ja existe um roteiro para este promotor na data informada',
      );
    }
  }

  private async normalizePlanItems(
    companyId: string,
    items: UpsertRoutePlanDto['items'],
  ): Promise<NormalizedPlanItem[]> {
    if (items.length === 0) {
      throw new BadRequestException(
        'O roteiro precisa ter pelo menos um cliente planejado',
      );
    }

    const customerIds = items.map((item) => item.customerId);
    const sequences = items.map((item) => item.sequence);

    if (customerIds.some((item) => !item?.trim())) {
      throw new BadRequestException(
        'Todas as linhas do roteiro precisam ter um cliente valido',
      );
    }

    if (new Set(customerIds).size !== customerIds.length) {
      throw new BadRequestException(
        'Um mesmo cliente nao pode aparecer mais de uma vez no roteiro',
      );
    }

    if (new Set(sequences).size !== sequences.length) {
      throw new BadRequestException(
        'A sequencia do roteiro precisa ser unica para cada parada',
      );
    }

    const customers = await this.prismaService.customer.findMany({
      where: this.buildOperationalCustomerWhere(companyId, {
        id: {
          in: customerIds,
        },
      }),
      select: {
        id: true,
      },
    });

    if (customers.length !== customerIds.length) {
      throw new NotFoundException('Um ou mais clientes do roteiro nao existem');
    }

    return [...items]
      .sort((left, right) => left.sequence - right.sequence)
      .map((item) => {
        const plannedStartAt = item.plannedStartAt
          ? new Date(item.plannedStartAt)
          : null;
        const plannedEndAt = item.plannedEndAt
          ? new Date(item.plannedEndAt)
          : null;

        if (
          plannedStartAt &&
          plannedEndAt &&
          plannedEndAt.getTime() < plannedStartAt.getTime()
        ) {
          throw new BadRequestException(
            'O horario final do cliente nao pode ser anterior ao horario inicial',
          );
        }

        return {
          routePlanItemId: item.routePlanItemId,
          customerId: item.customerId,
          sequence: item.sequence,
          priority: item.priority ?? RouteItemPriority.NORMAL,
          plannedStartAt,
          plannedEndAt,
          notes: item.notes?.trim() || null,
        };
      });
  }

  private async normalizeTemplateItems(
    companyId: string,
    items: RouteTemplateItemDto[],
  ): Promise<NormalizedTemplateItem[]> {
    if (items.length === 0) {
      throw new BadRequestException(
        'O modelo recorrente precisa ter pelo menos um cliente configurado',
      );
    }

    const customerIds = [...new Set(items.map((item) => item.customerId))];
    const customers = await this.prismaService.customer.findMany({
      where: this.buildOperationalCustomerWhere(companyId, {
        id: {
          in: customerIds,
        },
      }),
      select: {
        id: true,
      },
    });

    if (customers.length !== customerIds.length) {
      throw new NotFoundException(
        'Um ou mais clientes do modelo recorrente nao existem',
      );
    }

    return [...items]
      .sort((left, right) => left.sequence - right.sequence)
      .map((item) => ({
        routeTemplateItemId: item.routeTemplateItemId,
        customerId: item.customerId,
        sequence: item.sequence,
        priority: item.priority ?? RouteItemPriority.NORMAL,
        plannedStartTime: item.plannedStartTime?.trim() || null,
        plannedEndTime: item.plannedEndTime?.trim() || null,
        dayOfWeek: item.dayOfWeek ?? null,
        dayOfMonth: item.dayOfMonth ?? null,
        notes: item.notes?.trim() || null,
      }));
  }

  private buildOperationalCustomerWhere(
    companyId: string,
    extra?: Prisma.CustomerWhereInput,
  ): Prisma.CustomerWhereInput {
    return {
      companyId,
      status: CustomerStatus.ACTIVE,
      active: true,
      deletedAt: null,
      ...(extra ?? {}),
    };
  }

  private validateUpsertPayload(scope: ActorScope, dto: UpsertRoutePlanDto) {
    if (scope.role === UserRole.PROMOTER) {
      throw new BadRequestException(
        'Perfil sem permissao para alterar roteiros',
      );
    }

    const routeDate = this.parseRouteCalendarDate(dto.routeDate);

    if (Number.isNaN(routeDate.getTime())) {
      throw new BadRequestException('Data do roteiro invalida');
    }
  }

  private validateBatchPayload(
    scope: ActorScope,
    dto: BatchUpsertRoutePlansDto,
  ) {
    if (scope.role === UserRole.PROMOTER) {
      throw new BadRequestException(
        'Perfil sem permissao para alterar roteiros',
      );
    }

    const startDate = this.parseRouteCalendarDate(dto.startDate);
    const endDate = this.parseRouteCalendarDate(dto.endDate);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Periodo de roteiros invalido');
    }

    if (
      this.startOfDay(endDate).getTime() < this.startOfDay(startDate).getTime()
    ) {
      throw new BadRequestException(
        'A data final nao pode ser anterior a data inicial',
      );
    }
  }

  private validateTemplatePayload(
    scope: ActorScope,
    dto: UpsertRouteTemplateDto,
  ) {
    if (scope.role === UserRole.PROMOTER) {
      throw new BadRequestException(
        'Perfil sem permissao para alterar modelos de roteiro',
      );
    }

    if (!dto.name.trim()) {
      throw new BadRequestException('Informe o nome do modelo recorrente');
    }

    if (dto.effectiveFrom && dto.effectiveUntil) {
      const effectiveFrom = this.parseRouteCalendarDate(dto.effectiveFrom);
      const effectiveUntil = this.parseRouteCalendarDate(dto.effectiveUntil);

      if (effectiveUntil.getTime() < effectiveFrom.getTime()) {
        throw new BadRequestException(
          'A vigencia final do modelo nao pode ser anterior ao inicio',
        );
      }
    }
  }

  private resolveRouteQueryRange(query: ListRoutePlansQueryDto) {
    if (query.dateFrom || query.dateTo) {
      const rangeStart = this.parseRouteCalendarDate(
        query.dateFrom ?? query.date ?? new Date(),
      );
      const rangeEndBase = this.parseRouteCalendarDate(
        query.dateTo ?? query.dateFrom ?? query.date ?? new Date(),
      );
      const rangeEnd = new Date(rangeEndBase);
      rangeEnd.setDate(rangeEnd.getDate() + 1);

      return {
        rangeStart,
        rangeEnd,
        view:
          query.view ??
          this.inferPlanningViewFromRange(
            rangeStart.toISOString(),
            rangeEndBase.toISOString(),
          ),
      };
    }

    const referenceDate = query.date
      ? this.parseRouteCalendarDate(query.date)
      : new Date();
    const view = query.view ?? RoutePlanningViewMode.DAILY;

    switch (view) {
      case RoutePlanningViewMode.WEEKLY:
        return {
          rangeStart: this.startOfWeek(referenceDate),
          rangeEnd: this.endExclusiveOfWeek(referenceDate),
          view,
        };
      case RoutePlanningViewMode.MONTHLY:
        return {
          rangeStart: this.startOfMonth(referenceDate),
          rangeEnd: this.endExclusiveOfMonth(referenceDate),
          view,
        };
      case RoutePlanningViewMode.DAILY:
      default: {
        const [rangeStart, rangeEnd] = this.getDayRange(referenceDate);
        return {
          rangeStart,
          rangeEnd,
          view: RoutePlanningViewMode.DAILY,
        };
      }
    }
  }

  private resolveNextPlanStatus(
    existingStatus: RoutePlanStatus | undefined,
    requestedStatus: RoutePlanStatus | undefined,
    publishNow: boolean | undefined,
  ) {
    if (publishNow) {
      return RoutePlanStatus.PUBLISHED;
    }

    return requestedStatus ?? existingStatus ?? RoutePlanStatus.DRAFT;
  }

  private shouldPublish(status: RoutePlanStatus) {
    return (
      status !== RoutePlanStatus.DRAFT && status !== RoutePlanStatus.ARCHIVED
    );
  }

  private buildRoutePlanItemUpdate(
    existingStop: {
      id: string;
      sequence: number;
      priority: RouteItemPriority;
      plannedStartAt: Date | null;
      plannedEndAt: Date | null;
      notes: string | null;
      active: boolean;
      cancelledAt: Date | null;
      cancellationReason: string | null;
      client: {
        tradeName: string;
      };
    },
    item: NormalizedPlanItem,
  ) {
    const data: Prisma.RoutePlanItemUpdateInput = {};
    const logs: Array<{
      changeType: RouteChangeType;
      summary: string;
      previousSnapshot?: Prisma.InputJsonValue;
      nextSnapshot?: Prisma.InputJsonValue;
    }> = [];

    if (existingStop.sequence !== item.sequence) {
      data.sequence = item.sequence;
      logs.push({
        changeType: RouteChangeType.ITEM_REORDERED,
        summary: `Cliente ${existingStop.client.tradeName} movido da sequencia ${existingStop.sequence} para ${item.sequence}.`,
        previousSnapshot: { sequence: existingStop.sequence },
        nextSnapshot: { sequence: item.sequence },
      });
    }

    if (
      existingStop.plannedStartAt?.getTime() !==
        item.plannedStartAt?.getTime() ||
      existingStop.plannedEndAt?.getTime() !== item.plannedEndAt?.getTime()
    ) {
      data.plannedStartAt = item.plannedStartAt;
      data.plannedEndAt = item.plannedEndAt;
      logs.push({
        changeType: RouteChangeType.ITEM_RESCHEDULED,
        summary: `Janela operacional de ${existingStop.client.tradeName} atualizada.`,
        previousSnapshot: {
          plannedStartAt: existingStop.plannedStartAt?.toISOString() ?? null,
          plannedEndAt: existingStop.plannedEndAt?.toISOString() ?? null,
        },
        nextSnapshot: {
          plannedStartAt: item.plannedStartAt?.toISOString() ?? null,
          plannedEndAt: item.plannedEndAt?.toISOString() ?? null,
        },
      });
    }

    if (existingStop.priority !== item.priority) {
      data.priority = item.priority;
      logs.push({
        changeType: RouteChangeType.ITEM_PRIORITY_CHANGED,
        summary: `Prioridade de ${existingStop.client.tradeName} alterada para ${item.priority}.`,
        previousSnapshot: { priority: existingStop.priority },
        nextSnapshot: { priority: item.priority },
      });
    }

    if ((existingStop.notes ?? null) !== item.notes) {
      data.notes = item.notes;
      logs.push({
        changeType: RouteChangeType.ITEM_NOTE_CHANGED,
        summary: `Observacao operacional de ${existingStop.client.tradeName} atualizada.`,
        previousSnapshot: { notes: existingStop.notes },
        nextSnapshot: { notes: item.notes },
      });
    }

    if (!existingStop.active || existingStop.cancelledAt) {
      data.active = true;
      data.cancelledAt = null;
      data.cancelledByUser = {
        disconnect: true,
      };
      data.cancellationReason = null;
    }

    return {
      data,
      logs,
    };
  }

  private async createRouteChangeLog(
    transaction: TransactionClient,
    input: {
      companyId: string;
      routePlanId: string;
      routePlanItemId?: string;
      actorUserId?: string;
      changeType: RouteChangeType;
      summary: string;
      previousSnapshot?: Prisma.InputJsonValue;
      nextSnapshot?: Prisma.InputJsonValue;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    await transaction.routeChangeLog.create({
      data: {
        companyId: input.companyId,
        routePlanId: input.routePlanId,
        routePlanItemId: input.routePlanItemId,
        actorUserId: input.actorUserId,
        changeType: input.changeType,
        summary: input.summary,
        previousSnapshot: input.previousSnapshot,
        nextSnapshot: input.nextSnapshot,
        metadata: input.metadata,
      },
    });
  }

  private async createPromoterNotification(
    transaction: TransactionClient,
    input: {
      companyId: string;
      recipientUserId: string;
      routePlanId?: string;
      routePlanItemId?: string;
      type: NotificationType;
      title: string;
      message: string;
      payload?: Prisma.InputJsonValue;
    },
  ) {
    await transaction.notification.create({
      data: {
        companyId: input.companyId,
        recipientUserId: input.recipientUserId,
        routePlanId: input.routePlanId,
        routePlanItemId: input.routePlanItemId,
        type: input.type,
        title: input.title,
        message: input.message,
        payload: input.payload,
      },
    });
  }

  private serializePlanItemForLog(item: {
    id: string;
    clientId?: string;
    sequence: number;
    priority?: RouteItemPriority;
    plannedStartAt?: Date | null;
    plannedEndAt?: Date | null;
    notes?: string | null;
    active?: boolean;
    cancelledAt?: Date | null;
    cancellationReason?: string | null;
  }): Prisma.InputJsonValue {
    return {
      id: item.id,
      clientId: item.clientId ?? null,
      sequence: item.sequence,
      priority: item.priority ?? null,
      plannedStartAt: item.plannedStartAt?.toISOString() ?? null,
      plannedEndAt: item.plannedEndAt?.toISOString() ?? null,
      notes: item.notes ?? null,
      active: item.active ?? true,
      cancelledAt: item.cancelledAt?.toISOString() ?? null,
      cancellationReason: item.cancellationReason ?? null,
    };
  }

  private buildRouteUpdateNotificationMessage(
    routeDate: Date,
    counts: {
      addedCount: number;
      updatedCount: number;
      cancelledCount: number;
    },
  ) {
    return `Roteiro de ${routeDate.toISOString().slice(0, 10)} atualizado: ${counts.addedCount} inclusao(oes), ${counts.updatedCount} ajuste(s) e ${counts.cancelledCount} cancelamento(s).`;
  }

  private buildNextInstruction(
    stops: Array<{
      active: boolean;
      sequence: number;
      status: RouteStopStatus;
      client?: {
        tradeName: string;
      };
    }>,
  ) {
    const activeStops = stops
      .filter((stop) => stop.active)
      .sort((left, right) => left.sequence - right.sequence);
    const inProgress = activeStops.find(
      (stop) => stop.status === RouteStopStatus.IN_PROGRESS,
    );

    if (inProgress?.client) {
      return `Continue a visita em ${inProgress.client.tradeName}.`;
    }

    const nextStop = activeStops.find((stop) =>
      ACTIVE_STOP_STATUSES.includes(stop.status),
    );

    if (nextStop?.client) {
      return `Prossiga para ${nextStop.client.tradeName}.`;
    }

    return 'Roteiro sem proxima parada pendente.';
  }

  private resolveBatchDates(dto: BatchUpsertRoutePlansDto) {
    const startDate = this.parseRouteCalendarDate(dto.startDate);
    const endDate = this.parseRouteCalendarDate(dto.endDate);
    const dates = this.enumerateDates(startDate, endDate);

    if (
      dto.planningView === RoutePlanningViewMode.WEEKLY &&
      dto.weekdays?.length
    ) {
      return dates.filter((date) =>
        dto.weekdays?.includes(this.toScheduleDayOfWeek(date)),
      );
    }

    if (
      dto.planningView === RoutePlanningViewMode.MONTHLY &&
      dto.monthDays?.length
    ) {
      return dates.filter((date) => dto.monthDays?.includes(date.getDate()));
    }

    return dates;
  }

  private resolveTemplateTargetDates(
    template: {
      recurrence: RouteRecurrencePattern;
      weekdays: ScheduleDayOfWeek[];
      monthDays: number[];
      effectiveFrom: Date | null;
      effectiveUntil: Date | null;
    },
    dto: ApplyRouteTemplateDto,
  ) {
    const startDate = this.parseRouteCalendarDate(dto.startDate);
    const endDate = this.parseRouteCalendarDate(dto.endDate);

    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException(
        'A data final da aplicacao do modelo nao pode ser anterior ao inicio',
      );
    }

    return this.enumerateDates(startDate, endDate).filter((date) =>
      this.matchesTemplateToDate(template, date),
    );
  }

  private matchesTemplateToDate(
    template: {
      recurrence: RouteRecurrencePattern;
      weekdays: ScheduleDayOfWeek[];
      monthDays: number[];
      effectiveFrom: Date | null;
      effectiveUntil: Date | null;
    },
    date: Date,
  ) {
    if (
      template.effectiveFrom &&
      this.startOfDay(date) < this.startOfDay(template.effectiveFrom)
    ) {
      return false;
    }

    if (
      template.effectiveUntil &&
      this.startOfDay(date) > this.startOfDay(template.effectiveUntil)
    ) {
      return false;
    }

    const weekday = this.toScheduleDayOfWeek(date);
    const weekdayMatch =
      template.weekdays.length === 0 || template.weekdays.includes(weekday);
    const monthDayMatch =
      template.monthDays.length === 0 ||
      template.monthDays.includes(date.getDate());

    switch (template.recurrence) {
      case RouteRecurrencePattern.WEEKLY:
        return weekdayMatch;
      case RouteRecurrencePattern.MONTHLY:
        return monthDayMatch;
      case RouteRecurrencePattern.CUSTOM:
        return weekdayMatch && monthDayMatch;
      case RouteRecurrencePattern.DAILY:
      default:
        return weekdayMatch && monthDayMatch;
    }
  }

  private materializeTemplateItemsForDate(
    template: {
      items: Array<{
        id: string;
        customerId: string;
        sequence: number;
        priority: RouteItemPriority;
        plannedStartTime: string | null;
        plannedEndTime: string | null;
        dayOfWeek: ScheduleDayOfWeek | null;
        dayOfMonth: number | null;
        notes: string | null;
      }>;
    },
    date: Date,
  ): RoutePlanItemDto[] {
    const items = template.items
      .filter((item) => {
        if (
          item.dayOfWeek &&
          item.dayOfWeek !== this.toScheduleDayOfWeek(date)
        ) {
          return false;
        }

        if (item.dayOfMonth && item.dayOfMonth !== date.getDate()) {
          return false;
        }

        return true;
      })
      .sort((left, right) => left.sequence - right.sequence)
      .map<RoutePlanItemDto>((item) => ({
        routePlanItemId: undefined,
        customerId: item.customerId,
        sequence: item.sequence,
        priority: item.priority,
        plannedStartAt: item.plannedStartTime
          ? this.combineDateWithTime(date, item.plannedStartTime).toISOString()
          : undefined,
        plannedEndAt: item.plannedEndTime
          ? this.combineDateWithTime(date, item.plannedEndTime).toISOString()
          : undefined,
        notes: item.notes ?? undefined,
      }));

    const customerIds = items.map((item) => item.customerId);
    const sequences = items.map((item) => item.sequence);

    if (new Set(customerIds).size !== customerIds.length) {
      throw new BadRequestException(
        'O modelo recorrente gerou clientes duplicados para a mesma data',
      );
    }

    if (new Set(sequences).size !== sequences.length) {
      throw new BadRequestException(
        'O modelo recorrente gerou sequencias duplicadas para a mesma data',
      );
    }

    return items;
  }

  private toPlanningView(recurrence: RouteRecurrencePattern) {
    switch (recurrence) {
      case RouteRecurrencePattern.WEEKLY:
        return RoutePlanningViewMode.WEEKLY;
      case RouteRecurrencePattern.MONTHLY:
        return RoutePlanningViewMode.MONTHLY;
      case RouteRecurrencePattern.CUSTOM:
      case RouteRecurrencePattern.DAILY:
      default:
        return RoutePlanningViewMode.DAILY;
    }
  }

  private inferPlanningViewFromRange(startDate: string, endDate: string) {
    const start = this.startOfDay(new Date(startDate));
    const end = this.startOfDay(new Date(endDate));
    const diffDays = Math.round(
      (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
    );

    if (diffDays >= 27) {
      return RoutePlanningViewMode.MONTHLY;
    }

    if (diffDays >= 6) {
      return RoutePlanningViewMode.WEEKLY;
    }

    return RoutePlanningViewMode.DAILY;
  }

  private enumerateDates(startDate: Date, endDate: Date) {
    const dates: Date[] = [];
    const cursor = new Date(startDate);

    while (cursor.getTime() <= endDate.getTime()) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    return dates;
  }

  private toScheduleDayOfWeek(date: Date): ScheduleDayOfWeek {
    const lookup: ScheduleDayOfWeek[] = [
      ScheduleDayOfWeek.SUNDAY,
      ScheduleDayOfWeek.MONDAY,
      ScheduleDayOfWeek.TUESDAY,
      ScheduleDayOfWeek.WEDNESDAY,
      ScheduleDayOfWeek.THURSDAY,
      ScheduleDayOfWeek.FRIDAY,
      ScheduleDayOfWeek.SATURDAY,
    ];

    return lookup[date.getDay()] ?? ScheduleDayOfWeek.MONDAY;
  }

  private combineDateWithTime(date: Date, time: string) {
    const trimmed = time.trim();
    const [hoursRaw, minutesRaw] = trimmed.split(':');
    const hours = Number.parseInt(hoursRaw ?? '', 10);
    const minutes = Number.parseInt(minutesRaw ?? '', 10);

    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      throw new BadRequestException(
        `Horario invalido informado no modelo recorrente: ${time}`,
      );
    }

    const value = new Date(date);
    value.setHours(hours, minutes, 0, 0);
    return value;
  }

  private startOfDay(referenceDate: Date) {
    const start = new Date(referenceDate);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private parseRouteCalendarDate(input: string | Date) {
    if (input instanceof Date) {
      return this.startOfDay(input);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      const [year, month, day] = input.split('-').map((value) => Number(value));
      const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);

      if (
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== day
      ) {
        return new Date(Number.NaN);
      }

      return parsed;
    }

    return this.startOfDay(new Date(input));
  }

  private getDayRange(referenceDate = new Date()) {
    const start = this.startOfDay(referenceDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return [start, end] as const;
  }

  private startOfWeek(referenceDate: Date) {
    const start = this.startOfDay(referenceDate);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);
    return start;
  }

  private endExclusiveOfWeek(referenceDate: Date) {
    const end = this.startOfWeek(referenceDate);
    end.setDate(end.getDate() + 7);
    return end;
  }

  private startOfMonth(referenceDate: Date) {
    const start = this.startOfDay(referenceDate);
    start.setDate(1);
    return start;
  }

  private endExclusiveOfMonth(referenceDate: Date) {
    const end = this.startOfMonth(referenceDate);
    end.setMonth(end.getMonth() + 1);
    return end;
  }
}
