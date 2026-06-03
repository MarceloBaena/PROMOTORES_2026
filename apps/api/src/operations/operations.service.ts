import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  AlertSeverity,
  AlertType,
  AuditEntityType,
  GpsLogSource,
  PhotoCategory,
  PhotoGpsStatus,
  PhotoType,
  Prisma,
  RoutePlanStatus,
  RouteStopStatus,
  SyncOperationStatus,
  VisitPhotoStage,
  VisitCompletionStatus,
} from '@prisma/client';
import {
  calculateDistanceInMeters,
  type SyncBatchInput,
  syncBatchSchema,
  syncPullQuerySchema,
  syncPushSchema,
} from '@promotor/types';
import { AlertsService } from '../alerts/alerts.service';
import {
  calculateDurationSeconds,
  evaluateVisitAuditFlags,
  getAfterEvidencePhotos,
  getAuditAlertSeverity,
  getBeforeEvidencePhotos,
  getCheckInEstablishmentPhoto,
} from '../alerts/alert-rules';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  OperationalVisitStatus,
  mapCompletionToRouteStopStatus,
  mapOperationalVisitStatusToRouteStopStatuses,
  mapRouteStopStatusToOperationalVisitStatus,
} from '../visits/visit-status';
import type {
  CheckInDto,
  CheckInWithPhotoDto,
  CheckOutDto,
  EndJourneyDto,
  StartVisitServiceDto,
  StartJourneyDto,
  SubmitChecklistDto,
  SyncBatchDto,
  TrackPointDto,
  UploadPhotoQueryDto,
} from './operations.dto';

const visitInclude = Prisma.validator<Prisma.VisitInclude>()({
  client: true,
  routeStop: true,
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
});

const journeyInclude = Prisma.validator<Prisma.JourneyInclude>()({
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
});

type VisitWithRelations = Prisma.VisitGetPayload<{
  include: typeof visitInclude;
}>;

type JourneyWithPromoter = Prisma.JourneyGetPayload<{
  include: typeof journeyInclude;
}>;

type ChecklistQuestionSummary = {
  id: string;
  code: string;
  label: string;
  type: string;
  required: boolean;
  sortOrder: number;
};

type TodayVisitsQueryInput = {
  date?: string;
  status?: OperationalVisitStatus;
  search?: string;
  page?: number;
  pageSize?: number;
};

type SyncActionInput = SyncBatchInput['actions'][number];

type SyncActionResult = {
  id: string;
  clientGeneratedId: string;
  actionType: SyncActionInput['type'];
  success: boolean;
  status: 'SYNCED' | 'FAILED';
  processedAt: string;
  serverEntityId: string | null;
  result?: unknown;
  error?: string | null;
};

const RELEVANT_DELAY_MINUTES = 20;

@Injectable()
export class OperationsService {
  private readonly logger = new Logger(OperationsService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
    private readonly alertsService: AlertsService,
  ) {}

  async getTodayRoute(promoterId: string) {
    return this.getTodayRouteSnapshot(promoterId);
  }

  async pullSyncSnapshot(
    promoterId: string,
    query: {
      deviceId?: string;
      routeDate?: string;
      lastPulledAt?: string;
      lastKnownRouteVersion?: number;
    },
  ) {
    const parsed = syncPullQuerySchema.safeParse(query);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const referenceDate = parsed.data.routeDate
      ? new Date(`${parsed.data.routeDate}T00:00:00.000-04:00`)
      : new Date();
    const snapshot = await this.getTodayRouteSnapshot(
      promoterId,
      referenceDate,
    );
    const routeVersion = snapshot.route?.version ?? null;

    return {
      serverTime: new Date().toISOString(),
      deviceId: parsed.data.deviceId ?? null,
      routeDate: referenceDate.toISOString().slice(0, 10),
      routeVersion,
      hasRouteChange:
        typeof parsed.data.lastKnownRouteVersion === 'number'
          ? parsed.data.lastKnownRouteVersion !== routeVersion
          : Boolean(snapshot.route),
      snapshot,
    };
  }

  async pushSyncBatch(
    promoterId: string,
    dto: {
      deviceId?: string;
      pushedAt?: string;
      routeDate?: string;
      lastPulledAt?: string;
      actions: Record<string, unknown>[];
    },
  ) {
    const parsed = syncPushSchema.safeParse(dto);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const batchResult = await this.syncBatch(promoterId, {
      deviceId: parsed.data.deviceId,
      actions: parsed.data.actions,
    });
    const referenceDate = parsed.data.routeDate
      ? new Date(`${parsed.data.routeDate}T00:00:00.000-04:00`)
      : parsed.data.pushedAt
        ? new Date(parsed.data.pushedAt)
        : new Date();
    const snapshot = await this.getTodayRouteSnapshot(
      promoterId,
      referenceDate,
    );
    const acceptedActions = batchResult.results.filter(
      (item) => item.success,
    ).length;
    const rejectedActions = batchResult.results.length - acceptedActions;

    return {
      serverTime: new Date().toISOString(),
      deviceId: parsed.data.deviceId ?? null,
      pushedAt: parsed.data.pushedAt ?? new Date().toISOString(),
      acceptedActions,
      rejectedActions,
      results: batchResult.results,
      snapshot,
    };
  }

  private async getTodayRouteSnapshot(
    promoterId: string,
    referenceDate = new Date(),
  ) {
    const [rangeStart, rangeEnd] = this.getDayRange(referenceDate);
    const [routePlan, checklistTemplate, activeJourney] = await Promise.all([
      this.prismaService.routePlan.findFirst({
        where: this.buildPublishedRoutePlanDayWhere(
          promoterId,
          rangeStart,
          rangeEnd,
        ),
        include: {
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
          stops: {
            where: {
              active: true,
            },
            orderBy: {
              sequence: 'asc',
            },
            include: {
              client: true,
              visit: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      }),
      this.getChecklistTemplate(),
      this.getActiveJourney(promoterId),
    ]);
    const [resolvedRangeStart, resolvedRangeEnd] =
      this.getDayRange(referenceDate);
    const notifications = await this.prismaService.notification.findMany({
      where: {
        recipientUserId: promoterId,
        routePlanId: routePlan?.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });
    const activeStops = routePlan?.stops ?? [];

    this.logger.debug(
      `Consulta do roteiro do promotor promoterId=${promoterId} dateFrom=${resolvedRangeStart.toISOString()} dateTo=${resolvedRangeEnd.toISOString()} status=${RoutePlanStatus.PUBLISHED} routePlansFound=${
        routePlan ? 1 : 0
      } itemsFound=${activeStops.length}`,
    );

    const nextStop =
      activeStops.find((stop) => stop.status === RouteStopStatus.IN_PROGRESS) ??
      activeStops.find(
        (stop) =>
          stop.status === RouteStopStatus.PLANNED ||
          stop.status === RouteStopStatus.SYNC_PENDING,
      ) ??
      null;

    return {
      route: routePlan
        ? {
            id: routePlan.id,
            date: resolvedRangeStart.toISOString(),
            promoterId: routePlan.promoterId,
            promoterName: routePlan.promoter.user.name,
            planningView: routePlan.planningView,
            status: routePlan.status,
            version: routePlan.version,
            publishedAt: routePlan.publishedAt?.toISOString() ?? null,
            updatedAt: routePlan.updatedAt.toISOString(),
            notes: routePlan.notes ?? null,
            totalStops: routePlan.stops.length,
            completedStops: routePlan.stops.filter(
              (stop) => stop.status === RouteStopStatus.COMPLETED,
            ).length,
            pendingStops: routePlan.stops.filter(
              (stop) =>
                stop.status === RouteStopStatus.PLANNED ||
                stop.status === RouteStopStatus.IN_PROGRESS ||
                stop.status === RouteStopStatus.SYNC_PENDING,
            ).length,
            partialStops: routePlan.stops.filter(
              (stop) => stop.status === RouteStopStatus.PARTIAL,
            ).length,
            skippedStops: routePlan.stops.filter(
              (stop) => stop.status === RouteStopStatus.NOT_DONE,
            ).length,
            nextInstruction: nextStop
              ? `${
                  nextStop.status === RouteStopStatus.IN_PROGRESS
                    ? 'Continue'
                    : 'Prossiga'
                } para ${nextStop.client.tradeName}.`
              : 'Roteiro sem proxima parada pendente.',
            stops: routePlan.stops.map((stop) => ({
              id: stop.id,
              sequence: stop.sequence,
              priority: stop.priority,
              plannedDate: routePlan.routeDate.toISOString(),
              status: stop.status,
              operationalStatus: mapRouteStopStatusToOperationalVisitStatus(
                stop.status,
              ),
              plannedStartAt: stop.plannedStartAt?.toISOString(),
              plannedEndAt: stop.plannedEndAt?.toISOString(),
              notes: stop.notes ?? undefined,
              visitId: stop.visit?.id,
              client: {
                id: stop.client.id,
                tradeName: stop.client.tradeName,
                legalName: stop.client.legalName,
                address: stop.client.address,
                city: stop.client.city,
                state: stop.client.state,
                coordinates: {
                  latitude: stop.client.latitude,
                  longitude: stop.client.longitude,
                },
                geofence: {
                  latitude: stop.client.latitude,
                  longitude: stop.client.longitude,
                  radiusInMeters: stop.client.geofenceRadiusM,
                },
              },
            })),
          }
        : null,
      checklistTemplate,
      activeJourney,
      notifications: notifications.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        message: item.message,
        routePlanId: item.routePlanId ?? null,
        routePlanItemId: item.routePlanItemId ?? null,
        payload: item.payload,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  async getChecklistTemplate() {
    const template = await this.getActiveChecklistTemplateEntity();

    return template.questions.map((item) => ({
      code: item.code,
      label: item.label,
      type: item.type,
      required: item.required,
    }));
  }

  async getActiveJourney(promoterId: string) {
    const journey = await this.prismaService.journey.findFirst({
      where: {
        promoterId,
        active: true,
      },
      include: journeyInclude,
      orderBy: {
        startedAt: 'desc',
      },
    });

    if (!journey) {
      return null;
    }

    return this.toJourneyResponse(journey);
  }

  async getVisitForPromoter(promoterId: string, visitId: string) {
    return this.toVisitResponse(
      await this.getVisitOrThrow(promoterId, visitId),
    );
  }

  async listTodayVisits(promoterId: string, query: TodayVisitsQueryInput = {}) {
    const referenceDate = query.date ? new Date(query.date) : new Date();
    const [rangeStart, rangeEnd] = this.getDayRange(referenceDate);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.RoutePlanItemWhereInput = {
      active: true,
      routePlan: {
        ...this.buildPublishedRoutePlanDayWhere(
          promoterId,
          rangeStart,
          rangeEnd,
        ),
      },
      status: query.status
        ? {
            in: mapOperationalVisitStatusToRouteStopStatuses(query.status),
          }
        : undefined,
      client: query.search
        ? {
            tradeName: {
              contains: query.search,
              mode: 'insensitive',
            },
          }
        : undefined,
    };

    const [total, items] = await Promise.all([
      this.prismaService.routePlanItem.count({ where }),
      this.prismaService.routePlanItem.findMany({
        where,
        include: {
          client: true,
          routePlan: {
            select: {
              id: true,
              status: true,
              routeDate: true,
            },
          },
          visit: {
            include: {
              photos: true,
              checklist: true,
            },
          },
        },
        orderBy: {
          sequence: 'asc',
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
        routeStopId: item.id,
        visitId: item.visit?.id ?? null,
        routePlanId: item.routePlanId,
        routePlanStatus: item.routePlan.status,
        sequence: item.sequence,
        plannedStartAt: item.plannedStartAt?.toISOString(),
        plannedEndAt: item.plannedEndAt?.toISOString(),
        status: item.status,
        operationalStatus: mapRouteStopStatusToOperationalVisitStatus(
          item.status,
        ),
        completionStatus: item.visit?.completionStatus ?? null,
        client: {
          id: item.client.id,
          tradeName: item.client.tradeName,
          city: item.client.city,
          state: item.client.state,
        },
        checkInAt: item.visit?.checkInAt.toISOString() ?? null,
        checkOutAt: item.visit?.checkOutAt?.toISOString() ?? null,
        outsideGeofence: item.visit?.outsideGeofence ?? false,
        beforePhotosCount: getBeforeEvidencePhotos(item.visit?.photos ?? [])
          .length,
        afterPhotosCount: getAfterEvidencePhotos(item.visit?.photos ?? [])
          .length,
        checklistSubmitted: Boolean(item.visit?.checklist?.submittedAt),
      })),
    };
  }

  async updateVisitStatus(
    promoterId: string,
    visitId: string,
    input: {
      status: OperationalVisitStatus;
      note?: string;
    },
  ) {
    const visit = await this.getVisitOrThrow(promoterId, visitId);

    if (visit.checkOutAt) {
      throw new ConflictException(
        'Nao e possivel alterar o status de uma visita ja encerrada',
      );
    }

    const nextState = this.mapManualOperationalStatus(input.status);
    const note = input.note?.trim();

    if (
      input.status === OperationalVisitStatus.NAO_REALIZADA &&
      !note &&
      !visit.notes?.trim()
    ) {
      throw new BadRequestException(
        'Informe uma justificativa ao marcar a visita como nao realizada',
      );
    }

    const updatedVisit = await this.prismaService.$transaction(
      async (transaction) => {
        const result = await transaction.visit.update({
          where: {
            id: visitId,
          },
          data: {
            status: nextState.status,
            completionStatus: nextState.completionStatus,
            notes: note ?? visit.notes,
          },
        });

        await transaction.routePlanItem.update({
          where: {
            id: visit.routeStopId,
          },
          data: {
            status: nextState.status,
          },
        });

        await transaction.visitStatusHistory.create({
          data: {
            visitId,
            previousStatus: visit.status,
            nextStatus: nextState.status,
            previousCompletionStatus: visit.completionStatus ?? undefined,
            nextCompletionStatus: nextState.completionStatus ?? undefined,
            note:
              note ??
              `Status ajustado para ${mapRouteStopStatusToOperationalVisitStatus(nextState.status)}`,
          },
        });

        return result;
      },
    );

    if (nextState.alertType) {
      await this.alertsService.ensureActiveAlert({
        type: nextState.alertType,
        severity: nextState.alertSeverity,
        message: nextState.alertMessage(visit.client.tradeName),
        promoterId,
        clientId: visit.clientId,
        visitId,
      });
    }

    await this.auditService.record(
      promoterId,
      AuditEntityType.VISIT,
      visitId,
      'visit.status.updated',
      {
        previousStatus: visit.status,
        nextStatus: nextState.status,
        previousCompletionStatus: visit.completionStatus,
        nextCompletionStatus: nextState.completionStatus,
        note,
      },
    );

    this.logger.log(
      `Status da visita atualizado visitId=${visitId} promoterId=${promoterId} nextStatus=${nextState.status}`,
    );

    return this.toVisitResponse(
      await this.getVisitOrThrow(promoterId, updatedVisit.id),
    );
  }

  async updateVisitNotes(promoterId: string, visitId: string, notes: string) {
    const visit = await this.getVisitOrThrow(promoterId, visitId);
    const trimmedNotes = notes.trim();

    if (visit.checkOutAt) {
      throw new ConflictException('A visita ja foi finalizada');
    }

    if (trimmedNotes.length === 0) {
      throw new BadRequestException(
        'Observacoes da visita nao podem ser vazias',
      );
    }

    await this.prismaService.visit.update({
      where: {
        id: visitId,
      },
      data: {
        notes: trimmedNotes,
      },
    });

    await this.auditService.record(
      promoterId,
      AuditEntityType.VISIT,
      visitId,
      'visit.notes.updated',
      {
        previousNotes: visit.notes,
        nextNotes: trimmedNotes,
      },
    );

    this.logger.log(
      `Notas da visita atualizadas visitId=${visitId} promoterId=${promoterId}`,
    );

    return this.toVisitResponse(
      await this.getVisitOrThrow(promoterId, visitId),
    );
  }

  async startJourney(promoterId: string, dto: StartJourneyDto) {
    const normalizedEventId = this.normalizeEventId(dto.eventId);

    if (normalizedEventId) {
      const existingJourney = await this.prismaService.journey.findFirst({
        where: {
          promoterId,
          startEventId: normalizedEventId,
        },
        include: journeyInclude,
      });

      if (existingJourney) {
        this.logger.log(
          `Reprocessamento idempotente de inicio de jornada promoterId=${promoterId} eventId=${normalizedEventId}`,
        );
        return this.toJourneyResponse(existingJourney);
      }
    }

    const currentJourney = await this.prismaService.journey.findFirst({
      where: {
        promoterId,
        active: true,
      },
    });

    if (currentJourney) {
      throw new ConflictException('Ja existe uma jornada ativa');
    }

    const [rangeStart, rangeEnd] = this.getDayRange(new Date(dto.startedAt));
    const routePlan = await this.prismaService.routePlan.findFirst({
      where: this.buildPublishedRoutePlanDayWhere(
        promoterId,
        rangeStart,
        rangeEnd,
      ),
      select: {
        id: true,
      },
    });

    let journey: JourneyWithPromoter;

    try {
      journey = await this.prismaService.journey.create({
        data: {
          routePlanId: routePlan?.id,
          promoterId,
          startedAt: new Date(dto.startedAt),
          startLatitude: dto.location.latitude,
          startLongitude: dto.location.longitude,
          startEventId: normalizedEventId,
          active: true,
          trackPoints: {
            create: {
              promoterId,
              eventId: normalizedEventId,
              latitude: dto.location.latitude,
              longitude: dto.location.longitude,
              capturedAt: new Date(dto.startedAt),
              source: GpsLogSource.JOURNEY_START,
            },
          },
        },
        include: journeyInclude,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        if (normalizedEventId) {
          const existingJourney = await this.prismaService.journey.findFirst({
            where: {
              promoterId,
              startEventId: normalizedEventId,
            },
            include: journeyInclude,
          });

          if (existingJourney) {
            this.logger.warn(
              `Conflito concorrente recuperado no inicio da jornada promoterId=${promoterId} eventId=${normalizedEventId}`,
            );
            return this.toJourneyResponse(existingJourney);
          }
        }

        const activeJourney = await this.prismaService.journey.findFirst({
          where: {
            promoterId,
            active: true,
          },
        });

        if (activeJourney) {
          this.logger.warn(
            `Inicio concorrente de jornada bloqueado promoterId=${promoterId}`,
          );
          throw new ConflictException('Ja existe uma jornada ativa');
        }
      }

      throw error;
    }

    await this.auditService.record(
      promoterId,
      AuditEntityType.JOURNEY,
      journey.id,
      'journey.started',
      {
        startedAt: dto.startedAt,
        latitude: dto.location.latitude,
        longitude: dto.location.longitude,
      },
    );

    this.logger.log(
      `Jornada iniciada journeyId=${journey.id} promoterId=${promoterId}`,
    );

    return this.toJourneyResponse(journey);
  }

  async addTrackPoint(promoterId: string, dto: TrackPointDto) {
    const normalizedEventId = this.normalizeEventId(dto.eventId);

    if (normalizedEventId) {
      const existingTrackPoint = await this.prismaService.gpsLog.findFirst({
        where: {
          promoterId,
          eventId: normalizedEventId,
        },
      });

      if (existingTrackPoint) {
        return {
          id: existingTrackPoint.id,
          journeyId: existingTrackPoint.journeyId,
          capturedAt: existingTrackPoint.capturedAt.toISOString(),
        };
      }
    }

    const journey = await this.getActiveJourneyEntityOrThrow(promoterId);
    let trackPoint: { id: string; journeyId: string; capturedAt: Date };

    try {
      trackPoint = await this.prismaService.gpsLog.create({
        data: {
          journeyId: journey.id,
          promoterId,
          eventId: normalizedEventId,
          latitude: dto.location.latitude,
          longitude: dto.location.longitude,
          accuracyM: dto.accuracyM,
          capturedAt: new Date(dto.capturedAt),
          source: dto.source ?? GpsLogSource.TRACKING,
        },
      });
    } catch (error) {
      if (normalizedEventId && this.isUniqueConstraintError(error)) {
        const existingTrackPoint = await this.prismaService.gpsLog.findFirst({
          where: {
            promoterId,
            eventId: normalizedEventId,
          },
        });

        if (existingTrackPoint) {
          this.logger.warn(
            `Conflito concorrente recuperado no GPS promoterId=${promoterId} eventId=${normalizedEventId}`,
          );
          return {
            id: existingTrackPoint.id,
            journeyId: existingTrackPoint.journeyId,
            capturedAt: existingTrackPoint.capturedAt.toISOString(),
          };
        }
      }

      throw error;
    }

    return {
      id: trackPoint.id,
      journeyId: journey.id,
      capturedAt: trackPoint.capturedAt.toISOString(),
    };
  }

  async checkIn(promoterId: string, dto: CheckInDto) {
    const normalizedEventId = this.normalizeEventId(dto.eventId);

    if (normalizedEventId) {
      const existingVisit = await this.prismaService.visit.findFirst({
        where: {
          promoterId,
          checkInEventId: normalizedEventId,
        },
        include: visitInclude,
      });

      if (existingVisit) {
        this.logger.log(
          `Reprocessamento idempotente de check-in promoterId=${promoterId} visitId=${existingVisit.id} eventId=${normalizedEventId}`,
        );
        return this.toVisitResponse(existingVisit);
      }
    }

    const [rangeStart, rangeEnd] = this.getDayRange();
    const [journey, routeStop] = await Promise.all([
      this.getActiveJourneyEntityOrThrow(promoterId),
      this.prismaService.routePlanItem.findFirst({
        where: {
          id: dto.routeStopId,
          routePlan: this.buildPublishedRoutePlanDayWhere(
            promoterId,
            rangeStart,
            rangeEnd,
          ),
        },
        include: {
          client: true,
          visit: true,
        },
      }),
    ]);

    if (!routeStop) {
      throw new NotFoundException('Cliente do roteiro nao encontrado');
    }

    if (routeStop.visit || routeStop.status === RouteStopStatus.IN_PROGRESS) {
      throw new ConflictException('Esta visita ja foi iniciada');
    }

    if (
      routeStop.status === RouteStopStatus.COMPLETED ||
      routeStop.status === RouteStopStatus.PARTIAL ||
      routeStop.status === RouteStopStatus.NOT_DONE
    ) {
      throw new ConflictException('Esta visita ja foi encerrada');
    }

    const checkedInAt = new Date(dto.checkedInAt);
    const distance = calculateDistanceInMeters(
      {
        latitude: dto.location.latitude,
        longitude: dto.location.longitude,
      },
      {
        latitude: routeStop.client.latitude,
        longitude: routeStop.client.longitude,
      },
    );
    const outsideGeofence = distance > routeStop.client.geofenceRadiusM;

    if (outsideGeofence && !dto.justification?.trim()) {
      throw new BadRequestException(
        'Check-in fora da geofence exige justificativa operacional',
      );
    }

    let visit: { id: string };

    try {
      visit = await this.prismaService.$transaction(async (transaction) => {
        const createdVisit = await transaction.visit.create({
          data: {
            routePlanId: routeStop.routePlanId,
            routeStopId: routeStop.id,
            journeyId: journey.id,
            promoterId,
            clientId: routeStop.clientId,
            checkInAt: checkedInAt,
            checkInLatitude: dto.location.latitude,
            checkInLongitude: dto.location.longitude,
            checkInEventId: normalizedEventId,
            outsideGeofence,
            geofenceDistanceM: distance,
            outsideGeofenceJustification: dto.justification,
            status: RouteStopStatus.IN_PROGRESS,
          },
        });

        await transaction.routePlanItem.update({
          where: {
            id: routeStop.id,
          },
          data: {
            status: RouteStopStatus.IN_PROGRESS,
          },
        });

        await transaction.gpsLog.create({
          data: {
            journeyId: journey.id,
            promoterId,
            latitude: dto.location.latitude,
            longitude: dto.location.longitude,
            capturedAt: checkedInAt,
            eventId: this.deriveEventId(normalizedEventId, 'arrival'),
            source: GpsLogSource.CUSTOMER_ARRIVAL,
          },
        });

        await transaction.gpsLog.create({
          data: {
            journeyId: journey.id,
            promoterId,
            latitude: dto.location.latitude,
            longitude: dto.location.longitude,
            capturedAt: checkedInAt,
            eventId: normalizedEventId,
            source: GpsLogSource.CHECK_IN,
          },
        });

        await transaction.visitStatusHistory.create({
          data: {
            visitId: createdVisit.id,
            previousStatus: routeStop.status,
            nextStatus: RouteStopStatus.IN_PROGRESS,
            note: 'Check-in realizado',
          },
        });

        return createdVisit;
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        if (normalizedEventId) {
          const existingVisit = await this.prismaService.visit.findFirst({
            where: {
              promoterId,
              checkInEventId: normalizedEventId,
            },
            include: visitInclude,
          });

          if (existingVisit) {
            this.logger.warn(
              `Conflito concorrente recuperado no check-in promoterId=${promoterId} routeStopId=${dto.routeStopId} eventId=${normalizedEventId}`,
            );
            return this.toVisitResponse(existingVisit);
          }
        }

        const routeStopVisit = await this.prismaService.routePlanItem.findFirst(
          {
            where: {
              id: dto.routeStopId,
              routePlan: {
                promoterId,
              },
            },
            include: {
              visit: {
                select: {
                  id: true,
                },
              },
            },
          },
        );

        if (routeStopVisit?.visit?.id) {
          this.logger.warn(
            `Conflito concorrente recuperado por item do roteiro promoterId=${promoterId} routeStopId=${dto.routeStopId}`,
          );
          return this.toVisitResponse(
            await this.getVisitOrThrow(promoterId, routeStopVisit.visit.id),
          );
        }

        throw new ConflictException('Esta visita ja foi iniciada');
      }

      throw error;
    }

    if (outsideGeofence) {
      await this.alertsService.ensureActiveAlert({
        type: AlertType.OUTSIDE_GEOFENCE,
        severity: AlertSeverity.HIGH,
        message: `Check-in fora da geofence em ${routeStop.client.tradeName}`,
        promoterId,
        clientId: routeStop.clientId,
        visitId: visit.id,
      });
    }

    const delayInMinutes = this.getDelayInMinutes(
      routeStop.plannedStartAt,
      checkedInAt,
    );

    if (delayInMinutes >= RELEVANT_DELAY_MINUTES) {
      await this.alertsService.ensureActiveAlert({
        type: AlertType.RELEVANT_DELAY,
        severity: AlertSeverity.MEDIUM,
        message: `Atraso relevante de ${delayInMinutes}min no check-in em ${routeStop.client.tradeName}`,
        promoterId,
        clientId: routeStop.clientId,
        visitId: visit.id,
      });
    }

    await this.auditService.record(
      promoterId,
      AuditEntityType.VISIT,
      visit.id,
      'visit.checkin',
      {
        routeStopId: routeStop.id,
        checkedInAt: dto.checkedInAt,
        latitude: dto.location.latitude,
        longitude: dto.location.longitude,
        outsideGeofence,
        geofenceDistanceM: distance,
        delayInMinutes,
      },
    );

    this.logger.log(
      `Check-in realizado visitId=${visit.id} promoterId=${promoterId} outsideGeofence=${outsideGeofence} delayInMinutes=${delayInMinutes}`,
    );

    return this.buildVisitResponseAfterAuditSync(promoterId, visit.id);
  }

  async checkInWithPhoto(
    promoterId: string,
    dto: CheckInWithPhotoDto,
    file: Express.Multer.File,
  ) {
    const normalizedEventId = this.normalizeEventId(
      dto.clientGeneratedId ?? dto.eventId,
    );
    const normalizedPhotoEventId = this.normalizeEventId(
      dto.photoClientGeneratedId ?? dto.photoEventId,
    );

    if (normalizedEventId) {
      const existingVisit = await this.prismaService.visit.findFirst({
        where: {
          promoterId,
          checkInEventId: normalizedEventId,
        },
        include: visitInclude,
      });

      if (existingVisit) {
        const hasCheckInPhoto = Boolean(
          getCheckInEstablishmentPhoto(existingVisit.photos),
        );

        if (hasCheckInPhoto) {
          this.logger.log(
            `Reprocessamento idempotente de check-in com foto promoterId=${promoterId} visitId=${existingVisit.id} eventId=${normalizedEventId}`,
          );
          return this.toVisitResponse(existingVisit);
        }

        await this.uploadPhoto(
          promoterId,
          existingVisit.id,
          {
            type: PhotoType.BEFORE,
            category: PhotoCategory.CHECKIN_ESTABLISHMENT,
            stage: VisitPhotoStage.CHECKIN,
            capturedAt: dto.capturedAt,
            capturedLatitude: dto.photoCapturedLatitude ?? dto.latitude,
            capturedLongitude: dto.photoCapturedLongitude ?? dto.longitude,
            gpsStatus: dto.photoGpsStatus ?? PhotoGpsStatus.CAPTURED,
            gpsErrorCode: dto.photoGpsErrorCode,
            gpsErrorMessage: dto.photoGpsErrorMessage,
            eventId:
              normalizedPhotoEventId ??
              this.deriveEventId(normalizedEventId, 'checkin-photo'),
          },
          file,
        );

        return this.toVisitResponse(
          await this.getVisitOrThrow(promoterId, existingVisit.id),
        );
      }
    }

    const [rangeStart, rangeEnd] = this.getDayRange();
    const [journey, routeStop] = await Promise.all([
      this.getActiveJourneyEntityOrThrow(promoterId),
      this.prismaService.routePlanItem.findFirst({
        where: {
          id: dto.routeStopId,
          routePlan: this.buildPublishedRoutePlanDayWhere(
            promoterId,
            rangeStart,
            rangeEnd,
          ),
        },
        include: {
          client: true,
          visit: true,
        },
      }),
    ]);

    if (!routeStop) {
      throw new NotFoundException('Cliente do roteiro nao encontrado');
    }

    if (routeStop.visit || routeStop.status === RouteStopStatus.IN_PROGRESS) {
      throw new ConflictException('Esta visita ja foi iniciada');
    }

    if (
      routeStop.status === RouteStopStatus.COMPLETED ||
      routeStop.status === RouteStopStatus.PARTIAL ||
      routeStop.status === RouteStopStatus.NOT_DONE
    ) {
      throw new ConflictException('Esta visita ja foi encerrada');
    }

    const checkedInAt = new Date(dto.checkedInAt);
    const capturedAt = new Date(dto.capturedAt);
    const photoLocationMetadata = this.resolvePhotoLocationMetadata(
      {
        capturedLatitude: dto.photoCapturedLatitude,
        capturedLongitude: dto.photoCapturedLongitude,
        gpsStatus: dto.photoGpsStatus,
        gpsErrorCode: dto.photoGpsErrorCode,
        gpsErrorMessage: dto.photoGpsErrorMessage,
      },
      {
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    );
    const distance = calculateDistanceInMeters(
      {
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
      {
        latitude: routeStop.client.latitude,
        longitude: routeStop.client.longitude,
      },
    );
    const outsideGeofence = distance > routeStop.client.geofenceRadiusM;

    if (outsideGeofence && !dto.justification?.trim()) {
      throw new BadRequestException(
        'Check-in fora da geofence exige justificativa operacional',
      );
    }

    const storedFile = await this.storageService.saveFile({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
      folder: `visits/checkin/${dto.routeStopId}/establishment`,
    });

    let visit: { id: string };

    try {
      visit = await this.prismaService.$transaction(async (transaction) => {
        const createdVisit = await transaction.visit.create({
          data: {
            routePlanId: routeStop.routePlanId,
            routeStopId: routeStop.id,
            journeyId: journey.id,
            promoterId,
            clientId: routeStop.clientId,
            checkInAt: checkedInAt,
            checkInLatitude: dto.latitude,
            checkInLongitude: dto.longitude,
            checkInEventId: normalizedEventId,
            outsideGeofence,
            geofenceDistanceM: distance,
            outsideGeofenceJustification: dto.justification,
            status: RouteStopStatus.IN_PROGRESS,
          },
        });

        await transaction.routePlanItem.update({
          where: {
            id: routeStop.id,
          },
          data: {
            status: RouteStopStatus.IN_PROGRESS,
          },
        });

        await transaction.gpsLog.create({
          data: {
            journeyId: journey.id,
            promoterId,
            latitude: dto.latitude,
            longitude: dto.longitude,
            capturedAt: checkedInAt,
            eventId: this.deriveEventId(normalizedEventId, 'arrival'),
            source: GpsLogSource.CUSTOMER_ARRIVAL,
          },
        });

        await transaction.gpsLog.create({
          data: {
            journeyId: journey.id,
            promoterId,
            latitude: dto.latitude,
            longitude: dto.longitude,
            capturedAt: checkedInAt,
            eventId: normalizedEventId,
            source: GpsLogSource.CHECK_IN,
          },
        });

        await transaction.visitPhoto.create({
          data: {
            visitId: createdVisit.id,
            promoterId,
            clientId: routeStop.clientId,
            uploadEventId:
              normalizedPhotoEventId ??
              this.deriveEventId(normalizedEventId, 'checkin-photo'),
            type: PhotoType.BEFORE,
            category: PhotoCategory.CHECKIN_ESTABLISHMENT,
            stage: VisitPhotoStage.CHECKIN,
            storageBucket: storedFile.key.split('/')[0] || null,
            storageKey: storedFile.key,
            publicUrl: storedFile.publicUrl,
            originalName: file.originalname,
            mimeType: file.mimetype,
            sizeInBytes: storedFile.sizeInBytes,
            capturedAt,
            capturedLatitude: photoLocationMetadata.capturedLatitude,
            capturedLongitude: photoLocationMetadata.capturedLongitude,
            gpsStatus: photoLocationMetadata.gpsStatus,
            gpsErrorCode: photoLocationMetadata.gpsErrorCode,
            gpsErrorMessage: photoLocationMetadata.gpsErrorMessage,
          },
        });

        await transaction.visitStatusHistory.create({
          data: {
            visitId: createdVisit.id,
            previousStatus: routeStop.status,
            nextStatus: RouteStopStatus.IN_PROGRESS,
            note: 'Check-in realizado com foto do estabelecimento',
          },
        });

        return createdVisit;
      });
    } catch (error) {
      await this.storageService
        .deleteFile(storedFile.key)
        .catch((cleanupError) => {
          const cleanupMessage =
            cleanupError instanceof Error
              ? cleanupError.message
              : 'falha desconhecida';
          this.logger.warn(
            `Falha ao limpar foto de check-in orfa routeStopId=${dto.routeStopId} key=${storedFile.key} reason=${cleanupMessage}`,
          );
        });

      if (this.isUniqueConstraintError(error)) {
        if (normalizedEventId) {
          const existingVisit = await this.prismaService.visit.findFirst({
            where: {
              promoterId,
              checkInEventId: normalizedEventId,
            },
            include: visitInclude,
          });

          if (existingVisit) {
            const hasCheckInPhoto = Boolean(
              getCheckInEstablishmentPhoto(existingVisit.photos),
            );

            if (!hasCheckInPhoto) {
              await this.uploadPhoto(
                promoterId,
                existingVisit.id,
                {
                  type: PhotoType.BEFORE,
                  category: PhotoCategory.CHECKIN_ESTABLISHMENT,
                  stage: VisitPhotoStage.CHECKIN,
                  capturedAt: dto.capturedAt,
                  capturedLatitude: dto.photoCapturedLatitude ?? dto.latitude,
                  capturedLongitude:
                    dto.photoCapturedLongitude ?? dto.longitude,
                  gpsStatus: dto.photoGpsStatus ?? PhotoGpsStatus.CAPTURED,
                  gpsErrorCode: dto.photoGpsErrorCode,
                  gpsErrorMessage: dto.photoGpsErrorMessage,
                  eventId:
                    normalizedPhotoEventId ??
                    this.deriveEventId(normalizedEventId, 'checkin-photo'),
                },
                file,
              );
            }

            this.logger.warn(
              `Conflito concorrente recuperado no check-in com foto promoterId=${promoterId} routeStopId=${dto.routeStopId} eventId=${normalizedEventId}`,
            );
            return this.toVisitResponse(
              await this.getVisitOrThrow(promoterId, existingVisit.id),
            );
          }
        }

        const routeStopVisit = await this.prismaService.routePlanItem.findFirst(
          {
            where: {
              id: dto.routeStopId,
              routePlan: {
                promoterId,
              },
            },
            include: {
              visit: {
                select: {
                  id: true,
                },
              },
            },
          },
        );

        if (routeStopVisit?.visit?.id) {
          this.logger.warn(
            `Conflito concorrente recuperado por item do roteiro no check-in com foto promoterId=${promoterId} routeStopId=${dto.routeStopId}`,
          );
          return this.toVisitResponse(
            await this.getVisitOrThrow(promoterId, routeStopVisit.visit.id),
          );
        }

        throw new ConflictException('Esta visita ja foi iniciada');
      }

      throw error;
    }

    if (outsideGeofence) {
      await this.alertsService.ensureActiveAlert({
        type: AlertType.OUTSIDE_GEOFENCE,
        severity: AlertSeverity.HIGH,
        message: `Check-in fora da geofence em ${routeStop.client.tradeName}`,
        promoterId,
        clientId: routeStop.clientId,
        visitId: visit.id,
      });
    }

    const delayInMinutes = this.getDelayInMinutes(
      routeStop.plannedStartAt,
      checkedInAt,
    );

    if (delayInMinutes >= RELEVANT_DELAY_MINUTES) {
      await this.alertsService.ensureActiveAlert({
        type: AlertType.RELEVANT_DELAY,
        severity: AlertSeverity.MEDIUM,
        message: `Atraso relevante de ${delayInMinutes}min no check-in em ${routeStop.client.tradeName}`,
        promoterId,
        clientId: routeStop.clientId,
        visitId: visit.id,
      });
    }

    await this.auditService.record(
      promoterId,
      AuditEntityType.VISIT,
      visit.id,
      'visit.checkin.photo_required',
      {
        routeStopId: routeStop.id,
        checkedInAt: dto.checkedInAt,
        capturedAt: dto.capturedAt,
        latitude: dto.latitude,
        longitude: dto.longitude,
        outsideGeofence,
        geofenceDistanceM: distance,
        delayInMinutes,
        photoCategory: PhotoCategory.CHECKIN_ESTABLISHMENT,
        photoStage: VisitPhotoStage.CHECKIN,
        photoCapturedLatitude: photoLocationMetadata.capturedLatitude,
        photoCapturedLongitude: photoLocationMetadata.capturedLongitude,
        photoGpsStatus: photoLocationMetadata.gpsStatus,
        photoGpsErrorCode: photoLocationMetadata.gpsErrorCode,
        photoGpsErrorMessage: photoLocationMetadata.gpsErrorMessage,
      },
    );

    const persistedCheckInPhoto = await this.prismaService.visitPhoto.findFirst(
      {
        where: {
          visitId: visit.id,
          promoterId,
          category: PhotoCategory.CHECKIN_ESTABLISHMENT,
        },
        orderBy: {
          capturedAt: 'asc',
        },
      },
    );

    if (persistedCheckInPhoto) {
      await this.recordPhotoGpsExceptionAudit({
        promoterId,
        photoId: persistedCheckInPhoto.id,
        visitId: visit.id,
        stage: VisitPhotoStage.CHECKIN,
        gpsStatus: photoLocationMetadata.gpsStatus,
        gpsErrorCode: photoLocationMetadata.gpsErrorCode,
        gpsErrorMessage: photoLocationMetadata.gpsErrorMessage,
      });
    }

    this.logger.log(
      `Check-in com foto realizado visitId=${visit.id} promoterId=${promoterId} outsideGeofence=${outsideGeofence} delayInMinutes=${delayInMinutes}`,
    );

    return this.buildVisitResponseAfterAuditSync(promoterId, visit.id);
  }

  async startVisitService(
    promoterId: string,
    visitId: string,
    dto: StartVisitServiceDto,
  ) {
    const normalizedEventId = this.normalizeEventId(dto.eventId);
    const visit = await this.getVisitOrThrow(promoterId, visitId);

    if (normalizedEventId && visit.serviceStartEventId === normalizedEventId) {
      this.logger.log(
        `Reprocessamento idempotente de inicio do atendimento visitId=${visitId} promoterId=${promoterId} eventId=${normalizedEventId}`,
      );
      return this.toVisitResponse(visit);
    }

    if (visit.checkOutAt) {
      throw new ConflictException('A visita ja foi finalizada');
    }

    this.ensureVisitReadyForServiceStart(visit);

    if (visit.serviceStartedAt) {
      this.logger.log(
        `Inicio do atendimento ja registrado visitId=${visitId} promoterId=${promoterId}`,
      );
      return this.toVisitResponse(visit);
    }

    const startedAt = new Date(dto.startedAt);

    if (startedAt.getTime() < visit.checkInAt.getTime()) {
      throw new BadRequestException(
        'O inicio do atendimento nao pode ser anterior ao check-in.',
      );
    }

    let updatedVisit: { id: string };

    try {
      updatedVisit = await this.prismaService.visit.update({
        where: {
          id: visitId,
        },
        data: {
          serviceStartedAt: startedAt,
          serviceStartEventId: normalizedEventId,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const recoveredVisit = await this.getVisitOrThrow(promoterId, visitId);

        if (
          (normalizedEventId &&
            recoveredVisit.serviceStartEventId === normalizedEventId) ||
          recoveredVisit.serviceStartedAt
        ) {
          this.logger.warn(
            `Conflito concorrente recuperado no inicio do atendimento visitId=${visitId} promoterId=${promoterId}`,
          );
          return this.toVisitResponse(recoveredVisit);
        }
      }

      throw error;
    }

    await this.auditService.record(
      promoterId,
      AuditEntityType.VISIT,
      visitId,
      'visit.service_started',
      {
        startedAt: dto.startedAt,
      },
    );

    this.logger.log(
      `Atendimento iniciado visitId=${visitId} promoterId=${promoterId} startedAt=${dto.startedAt}`,
    );

    return this.toVisitResponse(
      await this.getVisitOrThrow(promoterId, updatedVisit.id),
    );
  }

  async uploadPhoto(
    promoterId: string,
    visitId: string,
    query: UploadPhotoQueryDto,
    file: Express.Multer.File,
  ) {
    const normalizedEventId = this.normalizeEventId(
      query.clientGeneratedId ?? query.eventId,
    );

    if (normalizedEventId) {
      const existingPhoto = await this.prismaService.visitPhoto.findFirst({
        where: {
          visitId,
          promoterId,
          uploadEventId: normalizedEventId,
        },
      });

      if (existingPhoto) {
        this.logger.log(
          `Reprocessamento idempotente de foto visitId=${visitId} promoterId=${promoterId} eventId=${normalizedEventId}`,
        );
        return {
          id: existingPhoto.id,
          type: existingPhoto.type,
          category: existingPhoto.category,
          stage: this.deriveVisitPhotoStage(
            existingPhoto.type,
            existingPhoto.category,
            existingPhoto.stage ?? undefined,
          ),
          url: existingPhoto.publicUrl,
          capturedAt: existingPhoto.capturedAt.toISOString(),
          capturedLatitude: existingPhoto.capturedLatitude,
          capturedLongitude: existingPhoto.capturedLongitude,
          gpsStatus: existingPhoto.gpsStatus,
          gpsErrorCode: existingPhoto.gpsErrorCode,
          gpsErrorMessage: existingPhoto.gpsErrorMessage,
          capturedDate: existingPhoto.capturedAt.toISOString().slice(0, 10),
          capturedTime: existingPhoto.capturedAt.toISOString().slice(11, 19),
        };
      }
    }

    const visit = await this.getVisitOrThrow(promoterId, visitId);

    if (visit.checkOutAt) {
      throw new ConflictException('A visita ja foi finalizada');
    }

    const category = query.category ?? PhotoCategory.GENERAL;
    const stage = this.deriveVisitPhotoStage(query.type, category, query.stage);
    const capturedAt = new Date(query.capturedAt);
    const photoLocationMetadata = this.resolvePhotoLocationMetadata({
      capturedLatitude: query.capturedLatitude,
      capturedLongitude: query.capturedLongitude,
      gpsStatus: query.gpsStatus,
      gpsErrorCode: query.gpsErrorCode,
      gpsErrorMessage: query.gpsErrorMessage,
    });

    if (category !== PhotoCategory.CHECKIN_ESTABLISHMENT) {
      this.ensureVisitReadyForEvidenceUpload(visit);

      if (
        visit.serviceStartedAt &&
        capturedAt.getTime() < visit.serviceStartedAt.getTime()
      ) {
        throw new BadRequestException(
          'A evidencia da visita nao pode ter timestamp anterior ao inicio do atendimento.',
        );
      }
    }

    if (
      category === PhotoCategory.CHECKIN_ESTABLISHMENT &&
      getCheckInEstablishmentPhoto(visit.photos)
    ) {
      throw new ConflictException(
        'Foto do estabelecimento ja registrada para este check-in.',
      );
    }

    if (
      query.type === PhotoType.AFTER &&
      getBeforeEvidencePhotos(visit.photos).length < 1
    ) {
      throw new BadRequestException('Tire a foto do antes para continuar.');
    }

    if (query.type === PhotoType.AFTER && visit.checklistResponses.length < 1) {
      throw new BadRequestException(
        'Registre a execucao da visita antes da foto do depois.',
      );
    }

    const storedFile = await this.storageService.saveFile({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
      folder: `visits/${visitId}/${stage.toLowerCase()}/${category.toLowerCase()}`,
    });

    let photo: {
      id: string;
      type: PhotoType;
      category: PhotoCategory;
      stage: VisitPhotoStage;
      publicUrl: string;
      capturedAt: Date;
      capturedLatitude: number | null;
      capturedLongitude: number | null;
      gpsStatus: PhotoGpsStatus | null;
      gpsErrorCode: string | null;
      gpsErrorMessage: string | null;
    };

    try {
      photo = await this.prismaService.visitPhoto.create({
        data: {
          visitId,
          promoterId,
          clientId: visit.clientId,
          uploadEventId: normalizedEventId,
          type: query.type,
          category,
          stage,
          storageBucket: storedFile.key.split('/')[0] || null,
          storageKey: storedFile.key,
          publicUrl: storedFile.publicUrl,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeInBytes: storedFile.sizeInBytes,
          capturedAt,
          capturedLatitude: photoLocationMetadata.capturedLatitude,
          capturedLongitude: photoLocationMetadata.capturedLongitude,
          gpsStatus: photoLocationMetadata.gpsStatus,
          gpsErrorCode: photoLocationMetadata.gpsErrorCode,
          gpsErrorMessage: photoLocationMetadata.gpsErrorMessage,
        },
      });
    } catch (error) {
      await this.storageService
        .deleteFile(storedFile.key)
        .catch((cleanupError) => {
          const cleanupMessage =
            cleanupError instanceof Error
              ? cleanupError.message
              : 'falha desconhecida';
          this.logger.warn(
            `Falha ao limpar arquivo orfao apos erro de persistencia visitId=${visitId} key=${storedFile.key} reason=${cleanupMessage}`,
          );
        });

      if (normalizedEventId && this.isUniqueConstraintError(error)) {
        const existingPhoto = await this.prismaService.visitPhoto.findFirst({
          where: {
            visitId,
            promoterId,
            uploadEventId: normalizedEventId,
          },
        });

        if (existingPhoto) {
          this.logger.warn(
            `Conflito concorrente recuperado no upload de foto visitId=${visitId} promoterId=${promoterId} eventId=${normalizedEventId}`,
          );
          return {
            id: existingPhoto.id,
            type: existingPhoto.type,
            category: existingPhoto.category,
            stage: this.deriveVisitPhotoStage(
              existingPhoto.type,
              existingPhoto.category,
              existingPhoto.stage ?? undefined,
            ),
            url: existingPhoto.publicUrl,
            capturedAt: existingPhoto.capturedAt.toISOString(),
            capturedLatitude: existingPhoto.capturedLatitude,
            capturedLongitude: existingPhoto.capturedLongitude,
            gpsStatus: existingPhoto.gpsStatus,
            gpsErrorCode: existingPhoto.gpsErrorCode,
            gpsErrorMessage: existingPhoto.gpsErrorMessage,
            capturedDate: existingPhoto.capturedAt.toISOString().slice(0, 10),
            capturedTime: existingPhoto.capturedAt.toISOString().slice(11, 19),
          };
        }
      }

      throw error;
    }

    await this.auditService.record(
      promoterId,
      AuditEntityType.PHOTO,
      photo.id,
      'visit.photo.uploaded',
      {
        visitId,
        type: query.type,
        category,
        stage,
        capturedAt: query.capturedAt,
        capturedLatitude: photoLocationMetadata.capturedLatitude,
        capturedLongitude: photoLocationMetadata.capturedLongitude,
        gpsStatus: photoLocationMetadata.gpsStatus,
        gpsErrorCode: photoLocationMetadata.gpsErrorCode,
        gpsErrorMessage: photoLocationMetadata.gpsErrorMessage,
      },
    );

    await this.recordPhotoGpsExceptionAudit({
      promoterId,
      photoId: photo.id,
      visitId,
      stage,
      gpsStatus: photoLocationMetadata.gpsStatus,
      gpsErrorCode: photoLocationMetadata.gpsErrorCode,
      gpsErrorMessage: photoLocationMetadata.gpsErrorMessage,
    });

    await this.syncVisitAuditFlagsById(promoterId, visitId);

    this.logger.log(
      `Foto vinculada a visita visitId=${visitId} promoterId=${promoterId} type=${query.type} category=${category} stage=${stage}`,
    );

    return {
      id: photo.id,
      type: photo.type,
      category: photo.category,
      stage: photo.stage,
      url: photo.publicUrl,
      capturedAt: photo.capturedAt.toISOString(),
      capturedLatitude: photo.capturedLatitude,
      capturedLongitude: photo.capturedLongitude,
      gpsStatus: photo.gpsStatus,
      gpsErrorCode: photo.gpsErrorCode,
      gpsErrorMessage: photo.gpsErrorMessage,
      capturedDate: photo.capturedAt.toISOString().slice(0, 10),
      capturedTime: photo.capturedAt.toISOString().slice(11, 19),
    };
  }

  async submitChecklist(
    promoterId: string,
    visitId: string,
    dto: SubmitChecklistDto,
  ) {
    const normalizedEventId = this.normalizeEventId(dto.eventId);
    const visit = await this.getVisitOrThrow(promoterId, visitId);

    if (normalizedEventId) {
      const existingChecklist =
        await this.prismaService.visitChecklist.findFirst({
          where: {
            visitId,
            submissionEventId: normalizedEventId,
          },
        });

      if (existingChecklist?.submittedAt) {
        this.logger.log(
          `Reprocessamento idempotente de checklist visitId=${visitId} promoterId=${promoterId} eventId=${normalizedEventId}`,
        );
        return this.toVisitResponse(
          await this.getVisitOrThrow(promoterId, visitId),
        );
      }
    }

    if (visit.checkOutAt) {
      throw new ConflictException('A visita ja foi finalizada');
    }

    this.ensureVisitReadyForEvidenceUpload(visit);

    if (getBeforeEvidencePhotos(visit.photos).length < 1) {
      throw new BadRequestException('Tire a foto do antes para continuar.');
    }

    const checklistTemplate = await this.getActiveChecklistTemplateEntity();
    const questions = checklistTemplate.questions.map((question) => ({
      id: question.id,
      code: question.code,
      label: question.label,
      type: question.type,
      required: question.required,
      sortOrder: question.sortOrder,
    }));

    this.validateChecklist(questions, dto.items);

    await this.prismaService.$transaction(async (transaction) => {
      const visitChecklist = await transaction.visitChecklist.upsert({
        where: {
          visitId,
        },
        update: {
          checklistTemplateId: checklistTemplate.id,
          submissionEventId: normalizedEventId,
          notes: dto.notes?.trim() || null,
          submittedAt: new Date(),
        },
        create: {
          visitId,
          checklistTemplateId: checklistTemplate.id,
          submissionEventId: normalizedEventId,
          notes: dto.notes?.trim() || null,
          submittedAt: new Date(),
        },
      });

      await transaction.visitChecklistAnswer.deleteMany({
        where: {
          visitChecklistId: visitChecklist.id,
          templateId: {
            notIn: questions.map((question) => question.id),
          },
        },
      });

      for (const item of dto.items) {
        const template = questions.find(
          (templateItem) => templateItem.code === item.code,
        );

        if (!template) {
          continue;
        }

        await transaction.visitChecklistAnswer.upsert({
          where: {
            visitChecklistId_templateId: {
              visitChecklistId: visitChecklist.id,
              templateId: template.id,
            },
          },
          update: {
            visitId,
            valueBoolean: typeof item.value === 'boolean' ? item.value : null,
            valueText:
              typeof item.value === 'string' ? item.value.trim() : null,
          },
          create: {
            visitChecklistId: visitChecklist.id,
            visitId,
            templateId: template.id,
            valueBoolean: typeof item.value === 'boolean' ? item.value : null,
            valueText:
              typeof item.value === 'string' ? item.value.trim() : null,
          },
        });
      }

      if (dto.notes?.trim()) {
        await transaction.visit.update({
          where: {
            id: visitId,
          },
          data: {
            notes: dto.notes.trim(),
          },
        });
      }
    });

    await this.auditService.record(
      promoterId,
      AuditEntityType.VISIT_CHECKLIST,
      visitId,
      'visit.checklist.submitted',
      {
        itemsCount: dto.items.length,
        checklistTemplateId: checklistTemplate.id,
      },
    );

    this.logger.log(
      `Checklist registrado visitId=${visitId} promoterId=${promoterId} items=${dto.items.length}`,
    );

    return this.toVisitResponse(
      await this.getVisitOrThrow(promoterId, visitId),
    );
  }

  async checkOut(promoterId: string, visitId: string, dto: CheckOutDto) {
    const normalizedEventId = this.normalizeEventId(dto.eventId);
    const visit = await this.getVisitOrThrow(promoterId, visitId);

    if (normalizedEventId && visit.checkOutEventId === normalizedEventId) {
      this.logger.log(
        `Reprocessamento idempotente de check-out visitId=${visitId} promoterId=${promoterId} eventId=${normalizedEventId}`,
      );
      return this.toVisitResponse(visit);
    }

    if (visit.checkOutAt) {
      throw new ConflictException('A visita ja foi finalizada');
    }

    await this.ensureVisitReadyForCheckout(visit);
    const checkedOutAt = new Date(dto.checkedOutAt);

    if (checkedOutAt.getTime() < visit.checkInAt.getTime()) {
      throw new BadRequestException(
        'O check-out nao pode ser anterior ao check-in.',
      );
    }

    if (
      visit.serviceStartedAt &&
      checkedOutAt.getTime() < visit.serviceStartedAt.getTime()
    ) {
      throw new BadRequestException(
        'O check-out nao pode ser anterior ao inicio do atendimento.',
      );
    }

    const nextStatus = mapCompletionToRouteStopStatus(dto.completionStatus);

    let updatedVisit: { id: string };

    try {
      updatedVisit = await this.prismaService.$transaction(
        async (transaction) => {
          const result = await transaction.visit.update({
            where: {
              id: visitId,
            },
            data: {
              checkOutAt: checkedOutAt,
              checkOutLatitude: dto.location.latitude,
              checkOutLongitude: dto.location.longitude,
              checkOutEventId: normalizedEventId,
              notes: dto.notes?.trim() || visit.notes,
              completionStatus: dto.completionStatus,
              status: nextStatus,
            },
          });

          await transaction.routePlanItem.update({
            where: {
              id: visit.routeStopId,
            },
            data: {
              status: nextStatus,
            },
          });

          await transaction.gpsLog.create({
            data: {
              journeyId: visit.journeyId,
              promoterId,
              latitude: dto.location.latitude,
              longitude: dto.location.longitude,
              capturedAt: new Date(dto.checkedOutAt),
              eventId: normalizedEventId,
              source: GpsLogSource.CHECK_OUT,
            },
          });

          await transaction.visitStatusHistory.create({
            data: {
              visitId,
              previousStatus: visit.status,
              nextStatus,
              previousCompletionStatus: visit.completionStatus ?? undefined,
              nextCompletionStatus: dto.completionStatus,
              note: dto.notes?.trim() || 'Check-out realizado',
            },
          });

          return result;
        },
      );
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const recoveredVisit = await this.getVisitOrThrow(promoterId, visitId);

        if (
          (normalizedEventId &&
            recoveredVisit.checkOutEventId === normalizedEventId) ||
          recoveredVisit.checkOutAt
        ) {
          this.logger.warn(
            `Conflito concorrente recuperado no check-out visitId=${visitId} promoterId=${promoterId}`,
          );
          return this.toVisitResponse(recoveredVisit);
        }
      }

      throw error;
    }

    if (dto.completionStatus !== VisitCompletionStatus.COMPLETED) {
      await this.alertsService.ensureActiveAlert({
        type:
          dto.completionStatus === VisitCompletionStatus.PARTIAL
            ? AlertType.PARTIAL_VISIT
            : AlertType.MISSED_VISIT,
        severity:
          dto.completionStatus === VisitCompletionStatus.PARTIAL
            ? AlertSeverity.MEDIUM
            : AlertSeverity.HIGH,
        message: `Visita encerrada como ${dto.completionStatus} em ${visit.client.tradeName}`,
        promoterId,
        clientId: visit.clientId,
        visitId,
      });
    }

    await this.auditService.record(
      promoterId,
      AuditEntityType.VISIT,
      visitId,
      'visit.checkout',
      {
        checkedOutAt: dto.checkedOutAt,
        completionStatus: dto.completionStatus,
        latitude: dto.location.latitude,
        longitude: dto.location.longitude,
      },
    );

    this.logger.log(
      `Check-out realizado visitId=${visitId} promoterId=${promoterId} completionStatus=${dto.completionStatus}`,
    );

    return this.buildVisitResponseAfterAuditSync(promoterId, updatedVisit.id);
  }

  async endJourney(promoterId: string, dto: EndJourneyDto) {
    const normalizedEventId = this.normalizeEventId(dto.eventId);

    if (normalizedEventId) {
      const existingJourney = await this.prismaService.journey.findFirst({
        where: {
          promoterId,
          endEventId: normalizedEventId,
        },
        include: journeyInclude,
      });

      if (existingJourney) {
        this.logger.log(
          `Reprocessamento idempotente de encerramento de jornada promoterId=${promoterId} journeyId=${existingJourney.id} eventId=${normalizedEventId}`,
        );
        return {
          ...this.toJourneyResponse(existingJourney),
          pendingStopsMarkedAsNotDone: 0,
        };
      }
    }

    const journey = await this.getActiveJourneyEntityOrThrow(promoterId);
    const [rangeStart, rangeEnd] = this.getDayRange(journey.startedAt);
    const openVisit = await this.prismaService.visit.findFirst({
      where: {
        promoterId,
        journeyId: journey.id,
        checkOutAt: null,
      },
    });

    if (openVisit) {
      throw new BadRequestException(
        'Existe visita em andamento. Finalize o atendimento antes.',
      );
    }

    const pendingStops = await this.prismaService.routePlanItem.findMany({
      where: {
        routePlan: this.buildPublishedRoutePlanDayWhere(
          promoterId,
          rangeStart,
          rangeEnd,
        ),
        status: RouteStopStatus.PLANNED,
      },
      include: {
        client: true,
      },
    });

    try {
      await this.prismaService.$transaction(async (transaction) => {
        await transaction.journey.update({
          where: {
            id: journey.id,
          },
          data: {
            active: false,
            endedAt: new Date(dto.endedAt),
            endLatitude: dto.location.latitude,
            endLongitude: dto.location.longitude,
            endEventId: normalizedEventId,
          },
        });

        await transaction.gpsLog.create({
          data: {
            journeyId: journey.id,
            promoterId,
            latitude: dto.location.latitude,
            longitude: dto.location.longitude,
            capturedAt: new Date(dto.endedAt),
            eventId: normalizedEventId,
            source: GpsLogSource.JOURNEY_END,
          },
        });

        if (pendingStops.length > 0) {
          await transaction.routePlanItem.updateMany({
            where: {
              id: {
                in: pendingStops.map((stop) => stop.id),
              },
            },
            data: {
              status: RouteStopStatus.NOT_DONE,
            },
          });
        }
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        if (normalizedEventId) {
          const existingJourney = await this.prismaService.journey.findFirst({
            where: {
              promoterId,
              endEventId: normalizedEventId,
            },
            include: journeyInclude,
          });

          if (existingJourney) {
            this.logger.warn(
              `Conflito concorrente recuperado no encerramento da jornada promoterId=${promoterId} eventId=${normalizedEventId}`,
            );
            return {
              ...this.toJourneyResponse(existingJourney),
              pendingStopsMarkedAsNotDone: 0,
            };
          }
        }

        const currentJourney = await this.prismaService.journey.findFirst({
          where: {
            id: journey.id,
            promoterId,
          },
          include: journeyInclude,
        });

        if (
          currentJourney &&
          !currentJourney.active &&
          currentJourney.endedAt
        ) {
          this.logger.warn(
            `Conflito concorrente recuperado por jornada ja encerrada journeyId=${journey.id} promoterId=${promoterId}`,
          );
          return {
            ...this.toJourneyResponse(currentJourney),
            pendingStopsMarkedAsNotDone: 0,
          };
        }
      }

      throw error;
    }

    await Promise.all(
      pendingStops.map(async (stop) => {
        await this.alertsService.ensureActiveAlert({
          type: AlertType.SKIPPED_CUSTOMER,
          severity: AlertSeverity.HIGH,
          message: `Cliente nao visitado: ${stop.client.tradeName}`,
          promoterId,
          clientId: stop.clientId,
        });
        await this.auditService.record(
          promoterId,
          AuditEntityType.ROUTE_PLAN_ITEM,
          stop.id,
          'route_plan_item.marked_not_done',
          {
            clientId: stop.clientId,
          },
        );
      }),
    );

    await this.auditService.record(
      promoterId,
      AuditEntityType.JOURNEY,
      journey.id,
      'journey.ended',
      {
        endedAt: dto.endedAt,
        latitude: dto.location.latitude,
        longitude: dto.location.longitude,
        pendingStops: pendingStops.length,
      },
    );

    this.logger.log(
      `Jornada encerrada journeyId=${journey.id} promoterId=${promoterId} pendingStops=${pendingStops.length}`,
    );

    return {
      ...this.toJourneyResponse({
        ...journey,
        endedAt: new Date(dto.endedAt),
        active: false,
      }),
      pendingStopsMarkedAsNotDone: pendingStops.length,
    };
  }

  private buildSyncPayloadHash(action: SyncActionInput) {
    return createHash('sha256').update(JSON.stringify(action)).digest('hex');
  }

  private getSyncActionVisitId(action: SyncActionInput) {
    switch (action.type) {
      case 'START_SERVICE':
      case 'SUBMIT_CHECKLIST':
      case 'UPDATE_NOTES':
      case 'CHECK_OUT':
        return action.payload.visitId;
      default:
        return null;
    }
  }

  private getSyncActionRouteStopId(action: SyncActionInput) {
    switch (action.type) {
      case 'CHECK_IN':
        return action.payload.routeStopId;
      default:
        return null;
    }
  }

  private getSyncActionEntityId(result: unknown) {
    if (
      result &&
      typeof result === 'object' &&
      'id' in result &&
      typeof result.id === 'string'
    ) {
      return result.id;
    }

    return null;
  }

  private async processSyncAction(promoterId: string, action: SyncActionInput) {
    switch (action.type) {
      case 'START_JOURNEY':
        return this.startJourney(promoterId, action.payload);
      case 'TRACK_POINT':
        return this.addTrackPoint(promoterId, action.payload);
      case 'CHECK_IN':
        return this.checkIn(promoterId, action.payload);
      case 'START_SERVICE':
        return this.startVisitService(
          promoterId,
          action.payload.visitId,
          action.payload.body,
        );
      case 'SUBMIT_CHECKLIST':
        return this.submitChecklist(
          promoterId,
          action.payload.visitId,
          action.payload.body,
        );
      case 'CHECK_OUT':
        return this.checkOut(
          promoterId,
          action.payload.visitId,
          action.payload.body,
        );
      case 'UPDATE_NOTES':
        return this.updateVisitNotes(
          promoterId,
          action.payload.visitId,
          action.payload.notes,
        );
      case 'END_JOURNEY':
        return this.endJourney(promoterId, action.payload);
    }
  }

  private async syncActionWithLedger(
    promoterId: string,
    deviceId: string | undefined,
    action: SyncActionInput,
  ): Promise<SyncActionResult> {
    const processedAt = new Date().toISOString();
    const payloadHash = this.buildSyncPayloadHash(action);
    const currentLog = await this.prismaService.syncOperation.findUnique({
      where: {
        promoterId_clientGeneratedId: {
          promoterId,
          clientGeneratedId: action.clientGeneratedId,
        },
      },
    });

    if (currentLog && currentLog.payloadHash !== payloadHash) {
      await this.syncSyncFailureAlert({
        active: true,
        promoterId,
        action,
        error:
          'client_generated_id reutilizado com payload diferente. O item local precisa ser recriado.',
      });

      return {
        id: action.id,
        clientGeneratedId: action.clientGeneratedId,
        actionType: action.type,
        success: false,
        status: 'FAILED',
        processedAt,
        serverEntityId: currentLog.serverEntityId,
        error:
          'client_generated_id reutilizado com payload diferente. O item local precisa ser recriado.',
      };
    }

    if (currentLog?.status === SyncOperationStatus.SYNCED) {
      const cachedResponse =
        currentLog.responsePayload &&
        typeof currentLog.responsePayload === 'object'
          ? (currentLog.responsePayload as Record<string, unknown>)
          : null;

      await this.syncSyncFailureAlert({
        active: false,
        promoterId,
        action,
        serverEntityId: currentLog.serverEntityId,
      });

      return {
        id: action.id,
        clientGeneratedId: action.clientGeneratedId,
        actionType: action.type,
        success: true,
        status: 'SYNCED',
        processedAt: currentLog.processedAt?.toISOString() ?? processedAt,
        serverEntityId: currentLog.serverEntityId,
        result: cachedResponse?.result,
      };
    }

    await this.prismaService.syncOperation.upsert({
      where: {
        promoterId_clientGeneratedId: {
          promoterId,
          clientGeneratedId: action.clientGeneratedId,
        },
      },
      update: {
        deviceId: deviceId ?? currentLog?.deviceId ?? null,
        actionId: action.id,
        actionType: action.type,
        routeStopId: this.getSyncActionRouteStopId(action),
        visitId: this.getSyncActionVisitId(action),
        payloadHash,
        requestPayload: action,
        status: SyncOperationStatus.SYNCING,
        lastError: null,
      },
      create: {
        promoterId,
        deviceId: deviceId ?? null,
        actionId: action.id,
        clientGeneratedId: action.clientGeneratedId,
        actionType: action.type,
        routeStopId: this.getSyncActionRouteStopId(action),
        visitId: this.getSyncActionVisitId(action),
        payloadHash,
        requestPayload: action,
        status: SyncOperationStatus.SYNCING,
      },
    });

    try {
      const result = await this.processSyncAction(promoterId, action);
      const serverEntityId = this.getSyncActionEntityId(result);
      const responsePayload = {
        result,
      };

      await this.prismaService.syncOperation.update({
        where: {
          promoterId_clientGeneratedId: {
            promoterId,
            clientGeneratedId: action.clientGeneratedId,
          },
        },
        data: {
          status: SyncOperationStatus.SYNCED,
          responsePayload,
          serverEntityId,
          lastError: null,
          processedAt: new Date(processedAt),
        },
      });

      await this.syncSyncFailureAlert({
        active: false,
        promoterId,
        action,
        serverEntityId,
      });

      this.logger.log(
        `Sync confirmado promoterId=${promoterId} actionType=${action.type} clientGeneratedId=${action.clientGeneratedId} serverEntityId=${serverEntityId ?? 'n/a'}`,
      );

      return {
        id: action.id,
        clientGeneratedId: action.clientGeneratedId,
        actionType: action.type,
        success: true,
        status: 'SYNCED',
        processedAt,
        serverEntityId,
        result,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Falha desconhecida ao sincronizar item';

      await this.prismaService.syncOperation.update({
        where: {
          promoterId_clientGeneratedId: {
            promoterId,
            clientGeneratedId: action.clientGeneratedId,
          },
        },
        data: {
          status: SyncOperationStatus.FAILED,
          responsePayload: {
            error: message,
          },
          lastError: message,
          processedAt: new Date(processedAt),
        },
      });

      await this.syncSyncFailureAlert({
        active: true,
        promoterId,
        action,
        error: message,
        serverEntityId: currentLog?.serverEntityId ?? null,
      });

      this.logger.warn(
        `Sync falhou promoterId=${promoterId} actionType=${action.type} clientGeneratedId=${action.clientGeneratedId} reason=${message}`,
      );

      return {
        id: action.id,
        clientGeneratedId: action.clientGeneratedId,
        actionType: action.type,
        success: false,
        status: 'FAILED',
        processedAt,
        serverEntityId: currentLog?.serverEntityId ?? null,
        error: message,
      };
    }
  }

  async syncBatch(promoterId: string, dto: SyncBatchDto) {
    const parsed = syncBatchSchema.safeParse(dto);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const results: SyncActionResult[] = [];

    for (const action of parsed.data.actions) {
      results.push(
        await this.syncActionWithLedger(promoterId, dto.deviceId, action),
      );
    }

    return {
      results,
    };
  }

  private async getActiveChecklistTemplateEntity() {
    const template = await this.prismaService.checklistTemplate.findFirst({
      where: {
        active: true,
        deletedAt: null,
      },
      include: {
        questions: {
          where: {
            active: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
      orderBy: [
        {
          version: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });

    if (!template) {
      throw new NotFoundException('Checklist ativo nao configurado');
    }

    return template;
  }

  private async getActiveJourneyEntityOrThrow(promoterId: string) {
    const journey = await this.prismaService.journey.findFirst({
      where: {
        promoterId,
        active: true,
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    if (!journey) {
      throw new BadRequestException('Nao existe jornada ativa para o promotor');
    }

    return journey;
  }

  private async getVisitOrThrow(promoterId: string, visitId: string) {
    const visit = await this.prismaService.visit.findFirst({
      where: {
        id: visitId,
        promoterId,
      },
      include: visitInclude,
    });

    if (!visit) {
      throw new NotFoundException('Visita nao encontrada');
    }

    return visit;
  }

  private validateChecklist(
    templates: ChecklistQuestionSummary[],
    items: Array<{
      code: string;
      label: string;
      type: string;
      required: boolean;
      value: boolean | string;
    }>,
  ) {
    const byCode = new Map(items.map((item) => [item.code, item]));

    for (const template of templates) {
      const response = byCode.get(template.code);

      if (!response) {
        if (template.required) {
          throw new BadRequestException(
            `Checklist obrigatorio ausente: ${template.label}`,
          );
        }

        continue;
      }

      if (
        response.type !== template.type ||
        response.required !== template.required
      ) {
        throw new BadRequestException(
          `Item invalido no checklist: ${template.label}`,
        );
      }

      if (template.type === 'BOOLEAN' && typeof response.value !== 'boolean') {
        throw new BadRequestException(
          `Resposta invalida para ${template.label}`,
        );
      }

      if (
        template.type === 'TEXT' &&
        (typeof response.value !== 'string' ||
          response.value.trim().length === 0)
      ) {
        throw new BadRequestException(
          `Resposta textual obrigatoria para ${template.label}`,
        );
      }
    }
  }

  private deriveVisitPhotoStage(
    type: PhotoType,
    category: PhotoCategory,
    requestedStage?: VisitPhotoStage,
  ) {
    if (requestedStage) {
      return requestedStage;
    }

    if (category === PhotoCategory.CHECKIN_ESTABLISHMENT) {
      return VisitPhotoStage.CHECKIN;
    }

    if (category === PhotoCategory.OTHER) {
      return VisitPhotoStage.OCCURRENCE_EXTRA;
    }

    return type === PhotoType.AFTER
      ? VisitPhotoStage.AFTER
      : VisitPhotoStage.BEFORE;
  }

  private resolvePhotoLocationMetadata(
    input: {
      capturedLatitude?: number;
      capturedLongitude?: number;
      gpsStatus?: PhotoGpsStatus;
      gpsErrorCode?: string;
      gpsErrorMessage?: string;
    },
    fallbackCoordinates?: {
      latitude: number;
      longitude: number;
    },
  ) {
    const shouldUseFallbackCoordinates =
      !input.gpsStatus || input.gpsStatus === PhotoGpsStatus.CAPTURED;
    const capturedLatitude =
      typeof input.capturedLatitude === 'number'
        ? input.capturedLatitude
        : shouldUseFallbackCoordinates
          ? (fallbackCoordinates?.latitude ?? null)
          : null;
    const capturedLongitude =
      typeof input.capturedLongitude === 'number'
        ? input.capturedLongitude
        : shouldUseFallbackCoordinates
          ? (fallbackCoordinates?.longitude ?? null)
          : null;
    const gpsStatus =
      input.gpsStatus ??
      (capturedLatitude !== null && capturedLongitude !== null
        ? PhotoGpsStatus.CAPTURED
        : null);

    if (
      gpsStatus === PhotoGpsStatus.CAPTURED &&
      (capturedLatitude === null || capturedLongitude === null)
    ) {
      throw new BadRequestException(
        'GPS capturado exige latitude e longitude da foto.',
      );
    }

    return {
      capturedLatitude,
      capturedLongitude,
      gpsStatus,
      gpsErrorCode: input.gpsErrorCode?.trim() || null,
      gpsErrorMessage: input.gpsErrorMessage?.trim() || null,
    };
  }

  private async recordPhotoGpsExceptionAudit(params: {
    promoterId: string;
    photoId: string;
    visitId: string;
    stage: VisitPhotoStage;
    gpsStatus: PhotoGpsStatus | null;
    gpsErrorCode?: string | null;
    gpsErrorMessage?: string | null;
  }) {
    if (!params.gpsStatus || params.gpsStatus === PhotoGpsStatus.CAPTURED) {
      return;
    }

    await this.auditService.record(
      params.promoterId,
      AuditEntityType.PHOTO,
      params.photoId,
      'visit.photo.gps_exception',
      {
        visitId: params.visitId,
        stage: params.stage,
        gpsStatus: params.gpsStatus,
        gpsErrorCode: params.gpsErrorCode ?? null,
        gpsErrorMessage: params.gpsErrorMessage ?? null,
      },
    );
  }

  private toVisitAuditFacts(visit: VisitWithRelations) {
    return {
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
      photos: visit.photos.map((photo) => ({
        type: photo.type,
        category: photo.category,
        capturedAt: photo.capturedAt,
        gpsStatus: photo.gpsStatus,
      })),
    };
  }

  private async syncVisitAuditFlags(
    visit: VisitWithRelations,
    options?: {
      activateMissingRequiredPhoto?: boolean;
    },
  ) {
    const evaluation = evaluateVisitAuditFlags(
      this.toVisitAuditFacts(visit),
      options,
    );

    await Promise.all([
      this.alertsService.syncAlertState({
        active: evaluation.gpsMissing,
        type: AlertType.GPS_MISSING,
        severity: getAuditAlertSeverity(AlertType.GPS_MISSING),
        message: `Visita com evidencia sem GPS capturado em ${visit.client.tradeName}`,
        promoterId: visit.promoterId,
        clientId: visit.clientId,
        visitId: visit.id,
      }),
      this.alertsService.syncAlertState({
        active: evaluation.outsideGeofence,
        type: AlertType.OUTSIDE_GEOFENCE,
        severity: getAuditAlertSeverity(AlertType.OUTSIDE_GEOFENCE),
        message: `Check-in fora da geofence em ${visit.client.tradeName}`,
        promoterId: visit.promoterId,
        clientId: visit.clientId,
        visitId: visit.id,
      }),
      this.alertsService.syncAlertState({
        active: evaluation.missingRequiredPhoto,
        type: AlertType.MISSING_REQUIRED_PHOTO,
        severity: getAuditAlertSeverity(AlertType.MISSING_REQUIRED_PHOTO),
        message: `Visita sem evidencias obrigatorias (${evaluation.missingRequiredPhotoItems.join(', ')}) em ${visit.client.tradeName}`,
        promoterId: visit.promoterId,
        clientId: visit.clientId,
        visitId: visit.id,
      }),
      this.alertsService.syncAlertState({
        active: evaluation.tooFastVisit,
        type: AlertType.TOO_FAST_VISIT,
        severity: getAuditAlertSeverity(AlertType.TOO_FAST_VISIT),
        message: `Visita concluida muito rapido em ${visit.client.tradeName} (${evaluation.executionDurationSeconds ?? 0}s de execucao)`,
        promoterId: visit.promoterId,
        clientId: visit.clientId,
        visitId: visit.id,
      }),
      this.alertsService.syncAlertState({
        active: evaluation.tooLongVisit,
        type: AlertType.TOO_LONG_VISIT,
        severity: getAuditAlertSeverity(AlertType.TOO_LONG_VISIT),
        message: `Visita com duracao acima do esperado em ${visit.client.tradeName} (${evaluation.totalDurationSeconds ?? 0}s totais)`,
        promoterId: visit.promoterId,
        clientId: visit.clientId,
        visitId: visit.id,
      }),
      this.alertsService.syncAlertState({
        active: evaluation.inconsistentFinish,
        type: AlertType.INCONSISTENT_FINISH,
        severity: getAuditAlertSeverity(AlertType.INCONSISTENT_FINISH),
        message: `Encerramento inconsistente identificado em ${visit.client.tradeName}`,
        promoterId: visit.promoterId,
        clientId: visit.clientId,
        visitId: visit.id,
      }),
      this.alertsService.syncAlertState({
        active: false,
        type: AlertType.MISSING_BEFORE_PHOTO,
        severity: AlertSeverity.MEDIUM,
        message: '',
        promoterId: visit.promoterId,
        clientId: visit.clientId,
        visitId: visit.id,
      }),
      this.alertsService.syncAlertState({
        active: false,
        type: AlertType.MISSING_AFTER_PHOTO,
        severity: AlertSeverity.MEDIUM,
        message: '',
        promoterId: visit.promoterId,
        clientId: visit.clientId,
        visitId: visit.id,
      }),
    ]);

    return evaluation;
  }

  private async syncVisitAuditFlagsById(
    promoterId: string,
    visitId: string,
    options?: {
      activateMissingRequiredPhoto?: boolean;
    },
  ) {
    const visit = await this.getVisitOrThrow(promoterId, visitId);
    return this.syncVisitAuditFlags(visit, options);
  }

  private async getSyncFailureAlertContext(
    promoterId: string,
    action: SyncActionInput,
    serverEntityId?: string | null,
  ) {
    const explicitVisitId =
      this.getSyncActionVisitId(action) ??
      (action.type === 'CHECK_IN' ? (serverEntityId ?? null) : null);

    if (explicitVisitId) {
      const visit = await this.prismaService.visit.findFirst({
        where: {
          id: explicitVisitId,
          promoterId,
        },
        include: {
          client: {
            select: {
              tradeName: true,
            },
          },
        },
      });

      if (visit) {
        return {
          clientId: visit.clientId,
          clientName: visit.client.tradeName,
          visitId: visit.id,
        };
      }
    }

    const routeStopId = this.getSyncActionRouteStopId(action);

    if (routeStopId) {
      const routeStop = await this.prismaService.routePlanItem.findFirst({
        where: {
          id: routeStopId,
          routePlan: {
            promoterId,
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
      });

      if (routeStop) {
        return {
          clientId: routeStop.clientId,
          clientName: routeStop.client.tradeName,
          visitId: routeStop.visit?.id ?? explicitVisitId ?? null,
        };
      }
    }

    return {
      clientId: undefined,
      clientName: null,
      visitId: explicitVisitId,
    };
  }

  private async syncSyncFailureAlert(params: {
    active: boolean;
    promoterId: string;
    action: SyncActionInput;
    error?: string | null;
    serverEntityId?: string | null;
  }) {
    const context = await this.getSyncFailureAlertContext(
      params.promoterId,
      params.action,
      params.serverEntityId,
    );
    const message = `Falha de sincronizacao (${params.action.type})${
      context.clientName ? ` em ${context.clientName}` : ''
    }: ${params.error ?? 'erro nao informado'}`;
    const scopes = [
      {
        clientId: context.clientId,
        visitId: context.visitId ?? undefined,
      },
    ];

    if (context.clientId && context.visitId) {
      scopes.push({
        clientId: context.clientId,
        visitId: undefined,
      });
    }

    await Promise.all(
      scopes.map((scope) =>
        this.alertsService.syncAlertState({
          active: params.active,
          type: AlertType.SYNC_FAILURE,
          severity: getAuditAlertSeverity(AlertType.SYNC_FAILURE),
          message,
          promoterId: params.promoterId,
          clientId: scope.clientId,
          visitId: scope.visitId,
          resolutionNote: params.active
            ? undefined
            : 'Sincronizacao confirmada pelo backend apos nova tentativa.',
        }),
      ),
    );
  }

  private async buildVisitResponseAfterAuditSync(
    promoterId: string,
    visitId: string,
  ) {
    const refreshedVisit = await this.getVisitOrThrow(promoterId, visitId);
    await this.syncVisitAuditFlags(refreshedVisit);
    return this.toVisitResponse(refreshedVisit);
  }

  private ensureVisitReadyForServiceStart(visit: VisitWithRelations) {
    const checkInPhoto = getCheckInEstablishmentPhoto(visit.photos);

    if (!checkInPhoto) {
      throw new BadRequestException(
        'O atendimento so pode ser iniciado depois da foto obrigatoria do estabelecimento no check-in.',
      );
    }
  }

  private ensureVisitReadyForEvidenceUpload(visit: VisitWithRelations) {
    this.ensureVisitReadyForServiceStart(visit);

    if (!visit.serviceStartedAt) {
      throw new BadRequestException(
        'Inicie o atendimento antes de registrar evidencias da execucao.',
      );
    }
  }

  private async ensureVisitReadyForCheckout(visit: VisitWithRelations) {
    const evaluation = await this.syncVisitAuditFlags(visit, {
      activateMissingRequiredPhoto: true,
    });

    if (evaluation.missingRequiredPhotoItems.length > 0) {
      this.logger.warn(
        `Check-out bloqueado visitId=${visit.id} missing=${evaluation.missingRequiredPhotoItems.join(', ')}`,
      );
      throw new BadRequestException(
        `Visita nao pode ser concluida sem ${evaluation.missingRequiredPhotoItems.join(', ')}`,
      );
    }

    if (visit.checklistResponses.length < 1) {
      this.logger.warn(
        `Check-out bloqueado visitId=${visit.id} missing=execucao registrada`,
      );
      throw new BadRequestException(
        'Visita nao pode ser concluida sem execucao registrada.',
      );
    }
  }

  private toPhotoResponse(photo: {
    id: string;
    type: PhotoType;
    category: PhotoCategory;
    stage?: VisitPhotoStage | null;
    publicUrl: string;
    capturedAt: Date;
    capturedLatitude?: number | null;
    capturedLongitude?: number | null;
    gpsStatus?: PhotoGpsStatus | null;
    gpsErrorCode?: string | null;
    gpsErrorMessage?: string | null;
  }) {
    return {
      id: photo.id,
      type: photo.type,
      category: photo.category,
      stage: this.deriveVisitPhotoStage(
        photo.type,
        photo.category,
        photo.stage ?? undefined,
      ),
      url: photo.publicUrl,
      capturedAt: photo.capturedAt.toISOString(),
      capturedLatitude: photo.capturedLatitude,
      capturedLongitude: photo.capturedLongitude,
      gpsStatus: photo.gpsStatus,
      gpsErrorCode: photo.gpsErrorCode,
      gpsErrorMessage: photo.gpsErrorMessage,
      capturedDate: photo.capturedAt.toISOString().slice(0, 10),
      capturedTime: photo.capturedAt.toISOString().slice(11, 19),
    };
  }

  private mapManualOperationalStatus(status: OperationalVisitStatus) {
    switch (status) {
      case OperationalVisitStatus.EM_ATENDIMENTO:
        return {
          status: RouteStopStatus.IN_PROGRESS,
          completionStatus: null,
          alertType: null,
          alertSeverity: null,
          alertMessage: () => '',
        };
      case OperationalVisitStatus.PARCIAL:
        return {
          status: RouteStopStatus.PARTIAL,
          completionStatus: VisitCompletionStatus.PARTIAL,
          alertType: AlertType.PARTIAL_VISIT,
          alertSeverity: AlertSeverity.MEDIUM,
          alertMessage: (clientName: string) =>
            `Visita marcada como parcial em ${clientName}`,
        };
      case OperationalVisitStatus.NAO_REALIZADA:
        return {
          status: RouteStopStatus.NOT_DONE,
          completionStatus: VisitCompletionStatus.NOT_DONE,
          alertType: AlertType.MISSED_VISIT,
          alertSeverity: AlertSeverity.HIGH,
          alertMessage: (clientName: string) =>
            `Visita marcada como nao realizada em ${clientName}`,
        };
      case OperationalVisitStatus.PENDENTE:
        throw new BadRequestException(
          'Nao e possivel retornar uma visita aberta para pendente',
        );
      case OperationalVisitStatus.CONCLUIDA:
        throw new BadRequestException('Use o check-out para concluir a visita');
    }
  }

  private getDelayInMinutes(plannedStartAt: Date | null, checkedInAt: Date) {
    if (!plannedStartAt) {
      return 0;
    }

    const diffInMs = checkedInAt.getTime() - plannedStartAt.getTime();

    if (diffInMs <= 0) {
      return 0;
    }

    return Math.floor(diffInMs / 60_000);
  }

  private toVisitResponse(visit: VisitWithRelations) {
    const orderedChecklist = [...visit.checklistResponses].sort(
      (left, right) => left.template.sortOrder - right.template.sortOrder,
    );
    const checkInPhoto = getCheckInEstablishmentPhoto(visit.photos);
    const beforePhotos = getBeforeEvidencePhotos(visit.photos);
    const afterPhotos = getAfterEvidencePhotos(visit.photos);

    return {
      id: visit.id,
      routeStopId: visit.routeStopId,
      journeyId: visit.journeyId,
      promoterId: visit.promoterId,
      clientId: visit.clientId,
      clientName: visit.client.tradeName,
      status: visit.status,
      operationalStatus: mapRouteStopStatusToOperationalVisitStatus(
        visit.status,
      ),
      completionStatus: visit.completionStatus,
      checkInAt: visit.checkInAt.toISOString(),
      serviceStartedAt: visit.serviceStartedAt?.toISOString(),
      checkOutAt: visit.checkOutAt?.toISOString(),
      totalDurationSeconds: calculateDurationSeconds(
        visit.checkInAt,
        visit.checkOutAt,
      ),
      executionDurationSeconds: calculateDurationSeconds(
        visit.serviceStartedAt,
        visit.checkOutAt,
      ),
      outsideGeofence: visit.outsideGeofence,
      geofenceDistanceM: visit.geofenceDistanceM,
      outsideGeofenceJustification: visit.outsideGeofenceJustification,
      notes: visit.notes,
      checkInPhoto: checkInPhoto ? this.toPhotoResponse(checkInPhoto) : null,
      beforePhotos: beforePhotos.map((photo) => this.toPhotoResponse(photo)),
      afterPhotos: afterPhotos.map((photo) => this.toPhotoResponse(photo)),
      checklist: orderedChecklist.map((response) => ({
        code: response.template.code,
        label: response.template.label,
        type: response.template.type,
        required: response.template.required,
        value:
          response.template.type === 'BOOLEAN'
            ? Boolean(response.valueBoolean)
            : (response.valueText ?? ''),
      })),
    };
  }

  private toJourneyResponse(journey: {
    id: string;
    promoterId: string;
    startedAt: Date;
    endedAt: Date | null;
    active: boolean;
    promoter?: {
      user: {
        name: string;
      };
    };
  }) {
    return {
      id: journey.id,
      promoterId: journey.promoterId,
      promoterName: journey.promoter?.user.name ?? 'Promotor',
      startedAt: journey.startedAt.toISOString(),
      endedAt: journey.endedAt?.toISOString(),
      active: journey.active,
    };
  }

  private normalizeEventId(eventId?: string | null) {
    const normalized = eventId?.trim();
    return normalized ? normalized : undefined;
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private deriveEventId(eventId: string | undefined, suffix: string) {
    return eventId ? `${eventId}:${suffix}` : undefined;
  }

  private buildPublishedRoutePlanDayWhere(
    promoterId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Prisma.RoutePlanWhereInput {
    return {
      promoterId,
      routeDate: {
        gte: rangeStart,
        lt: rangeEnd,
      },
      active: true,
      status: RoutePlanStatus.PUBLISHED,
      publishedAt: {
        not: null,
      },
    };
  }

  private getDayRange(referenceDate = new Date()) {
    const start = new Date(referenceDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return [start, end] as const;
  }
}
