import { Injectable, Logger } from '@nestjs/common';
import {
  AlertSeverity,
  AlertType,
  AuditEntityType,
  RouteStopStatus,
  SyncOperationStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUTOMATIC_ALERT_RESOLUTION_NOTE,
  evaluateVisitAuditFlags,
  getAuditAlertSeverity,
} from './alert-rules';

interface CreateAlertInput {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  promoterId: string;
  clientId?: string;
  visitId?: string;
}

interface SyncAlertStateInput extends CreateAlertInput {
  active: boolean;
  actorUserId?: string | null;
  resolutionNote?: string | null;
}

interface ResolveAlertScopeInput {
  type: AlertType;
  promoterId: string;
  clientId?: string;
  visitId?: string;
  actorUserId?: string | null;
  resolutionNote?: string | null;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private lastReconciliationAtByDate = new Map<string, number>();

  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createAlert(input: CreateAlertInput) {
    this.logger.warn(
      `Alerta criado type=${input.type} severity=${input.severity} promoterId=${input.promoterId} visitId=${input.visitId ?? 'n/a'}`,
    );

    const alert = await this.prismaService.alert.create({
      data: {
        type: input.type,
        severity: input.severity,
        message: input.message,
        promoterId: input.promoterId,
        clientId: input.clientId,
        visitId: input.visitId,
      },
    });

    await this.auditService.record(
      null,
      AuditEntityType.ALERT,
      alert.id,
      'alert.raised',
      {
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        promoterId: alert.promoterId,
        clientId: alert.clientId,
        visitId: alert.visitId,
      },
    );

    return alert;
  }

  async ensureActiveAlert(input: CreateAlertInput) {
    const existing = await this.prismaService.alert.findFirst({
      where: {
        type: input.type,
        promoterId: input.promoterId,
        clientId: input.clientId ?? null,
        visitId: input.visitId ?? null,
        resolvedAt: null,
        active: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!existing) {
      return this.createAlert(input);
    }

    if (
      existing.severity === input.severity &&
      existing.message === input.message
    ) {
      return existing;
    }

    const updated = await this.prismaService.alert.update({
      where: {
        id: existing.id,
      },
      data: {
        severity: input.severity,
        message: input.message,
      },
    });

    await this.auditService.record(
      null,
      AuditEntityType.ALERT,
      updated.id,
      'alert.updated',
      {
        previousSeverity: existing.severity,
        nextSeverity: updated.severity,
        previousMessage: existing.message,
        nextMessage: updated.message,
      },
    );

    return updated;
  }

  async resolveActiveAlertsByScope(input: ResolveAlertScopeInput) {
    const activeAlerts = await this.prismaService.alert.findMany({
      where: {
        type: input.type,
        promoterId: input.promoterId,
        clientId: input.clientId ?? null,
        visitId: input.visitId ?? null,
        resolvedAt: null,
        active: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (activeAlerts.length === 0) {
      return 0;
    }

    const resolvedAt = new Date();
    const resolutionNote =
      input.resolutionNote?.trim() || AUTOMATIC_ALERT_RESOLUTION_NOTE;

    for (const alert of activeAlerts) {
      await this.prismaService.alert.update({
        where: {
          id: alert.id,
        },
        data: {
          active: false,
          resolvedAt,
          resolutionNote,
        },
      });

      await this.auditService.record(
        input.actorUserId ?? null,
        AuditEntityType.ALERT,
        alert.id,
        'alert.auto_resolved',
        {
          resolutionNote,
          previousResolvedAt: alert.resolvedAt?.toISOString() ?? null,
        },
      );
    }

    return activeAlerts.length;
  }

  async syncAlertState(input: SyncAlertStateInput) {
    if (input.active) {
      return this.ensureActiveAlert(input);
    }

    await this.resolveActiveAlertsByScope(input);
    return null;
  }

  async reconcileOperationalAlerts(referenceDate = new Date()) {
    const dateKey = this.toDateKey(referenceDate);
    const lastRunAt = this.lastReconciliationAtByDate.get(dateKey);
    const now = Date.now();

    if (lastRunAt && now - lastRunAt < 60_000) {
      return;
    }

    this.lastReconciliationAtByDate.set(dateKey, now);

    const [rangeStart, rangeEnd] = this.getDayRange(referenceDate);
    await Promise.all([
      this.ensureCriticalNoJourneyAlerts(rangeStart, rangeEnd),
      this.ensureDelayedVisitAlerts(rangeStart, rangeEnd),
      this.ensureVisitAuditAlerts(rangeStart, rangeEnd),
      this.ensureSkippedCustomerAlerts(rangeStart, rangeEnd),
      this.ensureSyncFailureAlerts(rangeStart, rangeEnd),
    ]);
  }

  private async ensureCriticalNoJourneyAlerts(
    rangeStart: Date,
    rangeEnd: Date,
  ) {
    const criticalAt = new Date(rangeStart);
    criticalAt.setHours(9, 0, 0, 0);

    if (Date.now() < criticalAt.getTime()) {
      return;
    }

    const routePlans = await this.prismaService.routePlan.findMany({
      where: {
        routeDate: {
          gte: rangeStart,
          lt: rangeEnd,
        },
        active: true,
        promoter: {
          active: true,
          deletedAt: null,
        },
      },
      include: {
        promoter: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        journeys: {
          where: {
            startedAt: {
              gte: rangeStart,
              lt: rangeEnd,
            },
          },
          select: {
            id: true,
          },
        },
      },
    });

    await Promise.all(
      routePlans
        .filter((routePlan) => routePlan.journeys.length === 0)
        .map((routePlan) =>
          this.ensureActiveAlert({
            type: AlertType.NO_ACTIVE_JOURNEY,
            severity: AlertSeverity.HIGH,
            message: `Promotor ${routePlan.promoter.user.name} sem jornada iniciada no horario critico`,
            promoterId: routePlan.promoterId,
          }),
        ),
    );
  }

  private async ensureDelayedVisitAlerts(rangeStart: Date, rangeEnd: Date) {
    const delayedThreshold = new Date(Date.now() - 20 * 60_000);
    const delayedStops = await this.prismaService.routePlanItem.findMany({
      where: {
        active: true,
        status: RouteStopStatus.PLANNED,
        plannedStartAt: {
          lte: delayedThreshold,
        },
        routePlan: {
          routeDate: {
            gte: rangeStart,
            lt: rangeEnd,
          },
          active: true,
          promoter: {
            active: true,
            deletedAt: null,
          },
        },
      },
      include: {
        client: {
          select: {
            tradeName: true,
          },
        },
        routePlan: {
          select: {
            promoterId: true,
          },
        },
      },
    });

    await Promise.all(
      delayedStops.map((stop) =>
        this.ensureActiveAlert({
          type: AlertType.RELEVANT_DELAY,
          severity: AlertSeverity.MEDIUM,
          message: `Atraso relevante antes do atendimento em ${stop.client.tradeName}`,
          promoterId: stop.routePlan.promoterId,
          clientId: stop.clientId,
        }),
      ),
    );
  }

  private async ensureVisitAuditAlerts(rangeStart: Date, rangeEnd: Date) {
    const visits = await this.prismaService.visit.findMany({
      where: {
        checkInAt: {
          gte: rangeStart,
          lt: rangeEnd,
        },
      },
      include: {
        client: {
          select: {
            tradeName: true,
          },
        },
        photos: {
          select: {
            type: true,
            category: true,
            capturedAt: true,
            gpsStatus: true,
          },
        },
        checklistResponses: {
          include: {
            template: {
              select: {
                required: true,
              },
            },
          },
        },
      },
    });

    for (const visit of visits) {
      const evaluation = evaluateVisitAuditFlags({
        id: visit.id,
        promoterId: visit.promoterId,
        clientId: visit.clientId,
        clientName: visit.client.tradeName,
        status: visit.status,
        completionStatus: visit.completionStatus,
        checkInAt: visit.checkInAt,
        serviceStartedAt: visit.serviceStartedAt,
        checkOutAt: visit.checkOutAt,
        outsideGeofence: visit.outsideGeofence,
        photos: visit.photos,
      });
      const hasRequiredChecklist = visit.checklistResponses.some(
        (response) => response.template.required,
      );

      await Promise.all([
        this.syncAlertState({
          active: evaluation.gpsMissing,
          type: AlertType.GPS_MISSING,
          severity: getAuditAlertSeverity(AlertType.GPS_MISSING),
          message: `Visita com evidencia sem GPS capturado em ${visit.client.tradeName}`,
          promoterId: visit.promoterId,
          clientId: visit.clientId,
          visitId: visit.id,
        }),
        this.syncAlertState({
          active: evaluation.outsideGeofence,
          type: AlertType.OUTSIDE_GEOFENCE,
          severity: getAuditAlertSeverity(AlertType.OUTSIDE_GEOFENCE),
          message: `Check-in fora da geofence em ${visit.client.tradeName}`,
          promoterId: visit.promoterId,
          clientId: visit.clientId,
          visitId: visit.id,
        }),
        this.syncAlertState({
          active: evaluation.missingRequiredPhoto,
          type: AlertType.MISSING_REQUIRED_PHOTO,
          severity: getAuditAlertSeverity(AlertType.MISSING_REQUIRED_PHOTO),
          message: `Visita sem evidencias obrigatorias (${evaluation.missingRequiredPhotoItems.join(', ')}) em ${visit.client.tradeName}`,
          promoterId: visit.promoterId,
          clientId: visit.clientId,
          visitId: visit.id,
        }),
        this.syncAlertState({
          active: evaluation.tooFastVisit,
          type: AlertType.TOO_FAST_VISIT,
          severity: getAuditAlertSeverity(AlertType.TOO_FAST_VISIT),
          message: `Visita concluida muito rapido em ${visit.client.tradeName} (${evaluation.executionDurationSeconds ?? 0}s de execucao)`,
          promoterId: visit.promoterId,
          clientId: visit.clientId,
          visitId: visit.id,
        }),
        this.syncAlertState({
          active: evaluation.tooLongVisit,
          type: AlertType.TOO_LONG_VISIT,
          severity: getAuditAlertSeverity(AlertType.TOO_LONG_VISIT),
          message: `Visita com duracao acima do esperado em ${visit.client.tradeName} (${evaluation.totalDurationSeconds ?? 0}s totais)`,
          promoterId: visit.promoterId,
          clientId: visit.clientId,
          visitId: visit.id,
        }),
        this.syncAlertState({
          active: evaluation.inconsistentFinish,
          type: AlertType.INCONSISTENT_FINISH,
          severity: getAuditAlertSeverity(AlertType.INCONSISTENT_FINISH),
          message: `Encerramento inconsistente identificado em ${visit.client.tradeName}`,
          promoterId: visit.promoterId,
          clientId: visit.clientId,
          visitId: visit.id,
        }),
        this.syncAlertState({
          active: !hasRequiredChecklist,
          type: AlertType.MISSING_CHECKLIST,
          severity: AlertSeverity.HIGH,
          message: `Visita sem checklist preenchido em ${visit.client.tradeName}`,
          promoterId: visit.promoterId,
          clientId: visit.clientId,
          visitId: visit.id,
        }),
        this.syncAlertState({
          active: false,
          type: AlertType.MISSING_BEFORE_PHOTO,
          severity: AlertSeverity.MEDIUM,
          message: '',
          promoterId: visit.promoterId,
          clientId: visit.clientId,
          visitId: visit.id,
        }),
        this.syncAlertState({
          active: false,
          type: AlertType.MISSING_AFTER_PHOTO,
          severity: AlertSeverity.MEDIUM,
          message: '',
          promoterId: visit.promoterId,
          clientId: visit.clientId,
          visitId: visit.id,
        }),
      ]);
    }
  }

  private async ensureSkippedCustomerAlerts(rangeStart: Date, rangeEnd: Date) {
    const skippedStops = await this.prismaService.routePlanItem.findMany({
      where: {
        active: true,
        status: RouteStopStatus.NOT_DONE,
        routePlan: {
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
            tradeName: true,
          },
        },
        routePlan: {
          select: {
            promoterId: true,
          },
        },
        visit: {
          select: {
            id: true,
          },
        },
      },
    });

    await Promise.all(
      skippedStops.map((stop) =>
        this.ensureActiveAlert({
          type: AlertType.SKIPPED_CUSTOMER,
          severity: AlertSeverity.HIGH,
          message: `Cliente nao visitado: ${stop.client.tradeName}`,
          promoterId: stop.routePlan.promoterId,
          clientId: stop.clientId,
          visitId: stop.visit?.id,
        }),
      ),
    );
  }

  private async ensureSyncFailureAlerts(rangeStart: Date, rangeEnd: Date) {
    const failedOperations = await this.prismaService.syncOperation.findMany({
      where: {
        status: SyncOperationStatus.FAILED,
        createdAt: {
          gte: rangeStart,
          lt: rangeEnd,
        },
        promoter: {
          active: true,
          deletedAt: null,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const visitIds = failedOperations
      .map((item) => item.visitId)
      .filter((value): value is string => Boolean(value));
    const routeStopIds = failedOperations
      .map((item) => item.routeStopId)
      .filter((value): value is string => Boolean(value));
    const [visits, routeStops] = await Promise.all([
      visitIds.length > 0
        ? this.prismaService.visit.findMany({
            where: {
              id: {
                in: visitIds,
              },
            },
            include: {
              client: {
                select: {
                  tradeName: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      routeStopIds.length > 0
        ? this.prismaService.routePlanItem.findMany({
            where: {
              id: {
                in: routeStopIds,
              },
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
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);
    const visitsById = new Map(
      visits.map((visit) => [
        visit.id,
        {
          clientId: visit.clientId,
          clientName: visit.client.tradeName,
          visitId: visit.id,
        },
      ]),
    );
    const routeStopsById = new Map(
      routeStops.map((stop) => [
        stop.id,
        {
          clientId: stop.clientId,
          clientName: stop.client.tradeName,
          visitId: stop.visit?.id ?? null,
        },
      ]),
    );
    const activeScopeKeys = new Set<string>();

    for (const operation of failedOperations) {
      const visitContext = operation.visitId
        ? visitsById.get(operation.visitId)
        : null;
      const routeStopContext = operation.routeStopId
        ? routeStopsById.get(operation.routeStopId)
        : null;
      const clientId = visitContext?.clientId ?? routeStopContext?.clientId;
      const visitId =
        visitContext?.visitId ?? routeStopContext?.visitId ?? undefined;
      const clientName =
        visitContext?.clientName ??
        routeStopContext?.clientName ??
        'cliente nao identificado';

      activeScopeKeys.add(
        this.buildAlertScopeKey(
          AlertType.SYNC_FAILURE,
          operation.promoterId,
          clientId,
          visitId,
        ),
      );

      await this.syncAlertState({
        active: true,
        type: AlertType.SYNC_FAILURE,
        severity: getAuditAlertSeverity(AlertType.SYNC_FAILURE),
        message: `Falha de sincronizacao (${operation.actionType}) em ${clientName}: ${operation.lastError ?? 'erro nao informado'}`,
        promoterId: operation.promoterId,
        clientId,
        visitId,
      });
    }

    const activeAlerts = await this.prismaService.alert.findMany({
      where: {
        type: AlertType.SYNC_FAILURE,
        resolvedAt: null,
        active: true,
        createdAt: {
          gte: rangeStart,
          lt: rangeEnd,
        },
      },
    });

    for (const alert of activeAlerts) {
      const scopeKey = this.buildAlertScopeKey(
        alert.type,
        alert.promoterId,
        alert.clientId ?? undefined,
        alert.visitId ?? undefined,
      );

      if (!activeScopeKeys.has(scopeKey)) {
        await this.syncAlertState({
          active: false,
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          promoterId: alert.promoterId,
          clientId: alert.clientId ?? undefined,
          visitId: alert.visitId ?? undefined,
          resolutionNote:
            'Falha de sincronizacao removida apos nova confirmacao do backend.',
        });
      }
    }
  }

  private buildAlertScopeKey(
    type: AlertType,
    promoterId: string,
    clientId?: string | null,
    visitId?: string | null,
  ) {
    return [type, promoterId, clientId ?? '-', visitId ?? '-'].join('|');
  }

  private getDayRange(referenceDate = new Date()) {
    const start = new Date(referenceDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return [start, end] as const;
  }

  private toDateKey(referenceDate: Date) {
    const [start] = this.getDayRange(referenceDate);
    return start.toISOString();
  }
}
