'use client';

import {
  startTransition,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import {
  checkInSchema,
  checkOutSchema,
  endJourneySchema,
  isInsideGeofence,
  startJourneySchema,
  trackPointSchema,
} from '@promotor/types';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ImagePlus,
  LogOut,
  MapPinned,
  Navigation,
  RefreshCcw,
  TriangleAlert,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  ApiError,
  checkOutPromoterVisit,
  checkInPromoterVisitWithPhoto,
  endPromoterJourney,
  getPromoterRouteBundle,
  getPromoterTodayVisits,
  getPromoterVisit,
  logout,
  resolveAssetUrl,
  sendPromoterTrackPoint,
  startPromoterJourney,
  uploadPromoterPhoto,
} from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { getBrowserCoordinates, watchBrowserLocation } from '@/lib/browser-location';
import {
  createWebEventId,
  getAfterPhotoBlockerMessage,
  getBeforePhotoCount,
  hasCheckInEstablishmentPhoto,
  isPromoterVisitReadOnly,
  REQUIRED_BEFORE_PHOTOS,
} from '@/lib/promoter-workflow';
import type {
  PromoterRouteBundleResponse,
  PromoterRouteDayStop,
  PromoterTodayVisitItem,
  PromoterTodayVisitsResponse,
  PromoterVisitDetailsResponse,
  PromoterVisitPhoto,
} from '@/lib/promoter-types';
import {
  formatDate,
  formatDateTime,
  formatDistance,
  formatStatusLabel,
  statusBadgeClassName,
} from '@/lib/format';
import { EmptyState, ErrorState, LoadingState } from '@/components/page-states';
import { ActionBar } from '@/components/ui/action-bar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormField } from '@/components/ui/form-field';
import { NoticeCard } from '@/components/ui/notice-card';
import { PageHeader } from '@/components/ui/page-header';

const TRACKING_INTERVAL_MS = 30_000;
const ROUTE_REFRESH_INTERVAL_MS = 30_000;
type VisitStageKey = 'CHECKIN' | 'BEFORE' | 'AFTER' | 'FINISH';
type VisitStageTone = 'pending' | 'current' | 'confirmed' | 'blocked';
type VisitStageLabel = 'Pendente' | 'Em andamento' | 'Concluida' | 'Bloqueada';

const findVisitByStop = (visits: PromoterTodayVisitsResponse | null, routeStopId: string | null) =>
  visits?.items.find((item) => item.routeStopId === routeStopId) ?? null;

const getRouteStopStatusValue = (
  stop: PromoterRouteDayStop | null,
  visits: PromoterTodayVisitsResponse | null,
) => {
  if (!stop) {
    return 'PLANNED';
  }

  const visit = findVisitByStop(visits, stop.id);

  return (
    visit?.completionStatus ??
    visit?.operationalStatus ??
    visit?.status ??
    stop.operationalStatus ??
    stop.status
  );
};

const isRouteStopClosed = (status?: string | null) =>
  ['COMPLETED', 'CONCLUIDA', 'PARTIAL', 'PARCIAL', 'NOT_DONE', 'CANCELLED', 'CANCELED'].includes(
    status ?? '',
  );

const getRouteListStatusLabel = (status?: string | null) => {
  switch (status) {
    case 'IN_PROGRESS':
    case 'EM_ATENDIMENTO':
      return 'Em atendimento';
    case 'COMPLETED':
    case 'CONCLUIDA':
    case 'PARTIAL':
    case 'PARCIAL':
      return 'Concluido';
    case 'NOT_DONE':
    case 'CANCELLED':
    case 'CANCELED':
      return 'Cancelado';
    default:
      return 'Pendente';
  }
};

const resolveSelectedStopId = (
  bundle: PromoterRouteBundleResponse,
  visits: PromoterTodayVisitsResponse,
  preferredStopId?: string | null,
) => {
  const stops = bundle.route?.stops ?? [];

  if (preferredStopId) {
    const preferredStop = stops.find((stop) => stop.id === preferredStopId) ?? null;

    if (preferredStop && !isRouteStopClosed(getRouteStopStatusValue(preferredStop, visits))) {
      return preferredStopId;
    }
  }

  const inProgressStop = stops.find((stop) => {
    const statusValue = getRouteStopStatusValue(stop, visits);
    return statusValue === 'IN_PROGRESS' || statusValue === 'EM_ATENDIMENTO';
  });

  if (inProgressStop) {
    return inProgressStop.id;
  }

  const nextPlannedStop = stops.find((stop) => !isRouteStopClosed(getRouteStopStatusValue(stop, visits)));
  return nextPlannedStop?.id ?? stops[0]?.id ?? null;
};

const countVisitStatuses = (items: PromoterTodayVisitItem[], statuses: string[]) =>
  items.filter((item) => statuses.includes(item.completionStatus ?? item.status)).length;

const formatPlannedTime = (value?: string | null) => {
  if (!value) {
    return 'Nao informado';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Nao informado';
  }

  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getRoutePriorityLabel = (priority?: string | null) => {
  switch (priority) {
    case 'LOW':
      return 'Baixa';
    case 'HIGH':
      return 'Alta';
    case 'URGENT':
      return 'Urgente';
    case 'NORMAL':
    default:
      return 'Normal';
  }
};

const getRoutePriorityBadgeClassName = (priority?: string | null) => {
  switch (priority) {
    case 'URGENT':
      return 'badge badge-alert';
    case 'HIGH':
      return 'badge badge-partial';
    case 'LOW':
      return 'badge badge-completed';
    case 'NORMAL':
    default:
      return 'badge badge-in-progress';
  }
};

const isSessionError = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);

const CAMERA_PERMISSION_REQUIRED_MESSAGE = 'Permissao de camera necessaria para registrar a foto.';
const CAMERA_OPEN_FAILED_MESSAGE =
  'Nao foi possivel abrir a camera. Tente novamente ou escolha uma imagem da galeria.';
const CHECKIN_REQUIRED_PHOTO_MESSAGE =
  'Foto do estabelecimento obrigatoria para confirmar check-in.';
const CHECKIN_PHOTO_REVIEW_REQUIRED_MESSAGE =
  'Confirme a foto do estabelecimento antes de confirmar o check-in.';
const CHECKIN_PHOTO_CONFIRMATION_FAILED_MESSAGE =
  'Nao foi possivel confirmar a foto. Tente novamente.';

type PendingCheckInPhoto = {
  capturedAt: string;
  file: File;
  previewUrl: string;
};

type BeforePhotoSlot = 'BEFORE_1';

type PendingEvidencePhoto = {
  capturedAt: string;
  file: File;
  previewUrl: string;
};

const BEFORE_PHOTO_SLOTS: BeforePhotoSlot[] = ['BEFORE_1'];

const getBeforePhotoSlotLabel = () => 'Foto do antes';

const resolveCapturedAtFromFile = (file: File) => {
  const timestamp = file.lastModified;

  if (Number.isFinite(timestamp) && timestamp > 0) {
    const date = new Date(timestamp);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return new Date().toISOString();
};

const getPromoterPhotoCategoryLabel = (category?: string | null) => {
  switch (category) {
    case 'CHECKIN_ESTABLISHMENT':
      return 'Estabelecimento';
    case 'BEFORE_1':
      return 'Antes 1';
    case 'BEFORE_2':
      return 'Antes 2';
    case 'AFTER_1':
      return 'Depois 1';
    case 'AFTER_2':
      return 'Depois 2';
    case 'SHELF':
      return 'Gondola';
    case 'DISPLAY':
      return 'Ponta ou display';
    case 'PRICE_TAG':
      return 'Preco';
    case 'STOCK':
      return 'Estoque';
    case 'OTHER':
      return 'Outro';
    case 'GENERAL':
    default:
      return 'Geral';
  }
};

const formatOperationalTime = (value: string) => {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return '--:--';
  }

  return parsed.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const PromoterWorkspace = () => {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [bundle, setBundle] = useState<PromoterRouteBundleResponse | null>(null);
  const [todayVisits, setTodayVisits] = useState<PromoterTodayVisitsResponse | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [visitDetail, setVisitDetail] = useState<PromoterVisitDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingVisit, setLoadingVisit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [trackingMessage, setTrackingMessage] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<'overview' | 'visit'>('overview');
  const [showRouteUpdates, setShowRouteUpdates] = useState(false);
  const [checkInJustification, setCheckInJustification] = useState('');
  const [checkInConfirmationOpen, setCheckInConfirmationOpen] = useState(false);
  const [pendingCheckInPhoto, setPendingCheckInPhoto] = useState<PendingCheckInPhoto | null>(null);
  const [isCheckInPhotoConfirmed, setIsCheckInPhotoConfirmed] = useState(false);
  const [pendingBeforePhotos, setPendingBeforePhotos] = useState<
    Record<BeforePhotoSlot, PendingEvidencePhoto | null>
  >({
    BEFORE_1: null,
  });
  const [pendingAfterPhoto, setPendingAfterPhoto] = useState<PendingEvidencePhoto | null>(null);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const trackingInFlightRef = useRef(false);
  const lastTrackSentAtRef = useRef(0);
  const hasLoadedWorkspaceRef = useRef(false);
  const lastKnownRouteVersionRef = useRef<number | null>(null);
  const lastKnownNotificationIdsRef = useRef<string>('');
  const pendingPhotoPickerRef = useRef<{
    section: 'CHECKIN' | 'BEFORE' | 'AFTER';
    source: 'camera' | 'gallery';
  } | null>(null);
  const routeStops = bundle?.route?.stops ?? [];

  const selectedStop = bundle?.route?.stops.find((stop) => stop.id === selectedStopId) ?? null;
  const selectedVisitSummary = findVisitByStop(todayVisits, selectedStopId);
  const nextStop =
    routeStops.find((stop) => !isRouteStopClosed(getRouteStopStatusValue(stop, todayVisits))) ??
    routeStops[0] ??
    null;
  const isVisitReadOnly = isPromoterVisitReadOnly(visitDetail);
  const afterPhotoBlockerMessage = getAfterPhotoBlockerMessage(visitDetail);
  const activeJourney = bundle?.activeJourney ?? null;
  const routeNotifications = bundle?.notifications ?? [];
  const hasRecentRouteUpdate =
    routeNotifications.length > 0 || actionMessage?.startsWith('Roteiro atualizado') === true;
  const completedVisits = countVisitStatuses(todayVisits?.items ?? [], ['COMPLETED']);
  const pendingVisits = countVisitStatuses(todayVisits?.items ?? [], [
    'PLANNED',
    'IN_PROGRESS',
    'SYNC_PENDING',
  ]);
  const selectedStopStatusValue =
    visitDetail?.completionStatus ??
    visitDetail?.status ??
    selectedVisitSummary?.completionStatus ??
    selectedVisitSummary?.status ??
    selectedStop?.status ??
    'PLANNED';
  const getBeforePhotoByCategory = (slot: BeforePhotoSlot) =>
    visitDetail?.beforePhotos.find((photo) => photo.category === slot) ?? null;
  const hasCheckInPhoto = hasCheckInEstablishmentPhoto(visitDetail);
  const beforePhotoCount = getBeforePhotoCount(visitDetail);
  const hasBeforePhoto = beforePhotoCount > 0;
  const hasAfterPhoto = (visitDetail?.afterPhotos.length ?? 0) > 0;
  const isCheckInStageComplete = Boolean(visitDetail?.checkInAt && hasCheckInPhoto);
  const beforePhotoBlockerMessage = !visitDetail
    ? 'Faca o check-in para liberar a foto do antes.'
    : !hasCheckInPhoto
      ? 'Confirme o check-in com a foto do estabelecimento antes de continuar.'
      : null;
  const stageStatusByKey: Record<VisitStageKey, { label: VisitStageLabel; tone: VisitStageTone }> =
    visitDetail?.checkOutAt
      ? {
          CHECKIN: { label: 'Concluida', tone: 'confirmed' },
          BEFORE: { label: 'Concluida', tone: 'confirmed' },
          AFTER: { label: 'Concluida', tone: 'confirmed' },
          FINISH: { label: 'Concluida', tone: 'confirmed' },
        }
      : !isCheckInStageComplete
        ? {
            CHECKIN: { label: 'Em andamento', tone: 'current' },
            BEFORE: { label: 'Bloqueada', tone: 'blocked' },
            AFTER: { label: 'Bloqueada', tone: 'blocked' },
            FINISH: { label: 'Bloqueada', tone: 'blocked' },
          }
        : !hasBeforePhoto
          ? {
              CHECKIN: { label: 'Concluida', tone: 'confirmed' },
              BEFORE: { label: 'Em andamento', tone: 'current' },
              AFTER: { label: 'Bloqueada', tone: 'blocked' },
              FINISH: { label: 'Bloqueada', tone: 'blocked' },
            }
          : !hasAfterPhoto
            ? {
                CHECKIN: { label: 'Concluida', tone: 'confirmed' },
                BEFORE: { label: 'Concluida', tone: 'confirmed' },
                AFTER: { label: 'Em andamento', tone: 'current' },
                FINISH: { label: 'Bloqueada', tone: 'blocked' },
              }
            : {
                CHECKIN: { label: 'Concluida', tone: 'confirmed' },
                BEFORE: { label: 'Concluida', tone: 'confirmed' },
                AFTER: { label: 'Concluida', tone: 'confirmed' },
                FINISH: { label: 'Em andamento', tone: 'current' },
              };
  const visitStages = [
    {
      key: 'CHECKIN' as const,
      step: '1',
      title: 'Check-in com foto',
      description: 'Foto obrigatoria do estabelecimento para iniciar o atendimento.',
      ...stageStatusByKey.CHECKIN,
    },
    {
      key: 'BEFORE' as const,
      step: '2',
      title: 'Foto do antes',
      description: 'Capture e confirme a foto do antes para liberar a proxima etapa.',
      ...stageStatusByKey.BEFORE,
    },
    {
      key: 'AFTER' as const,
      step: '3',
      title: 'Foto do depois',
      description: 'Capture e confirme a foto do depois para preparar o encerramento.',
      ...stageStatusByKey.AFTER,
    },
    {
      key: 'FINISH' as const,
      step: '4',
      title: 'Encerrar atendimento',
      description: 'Finalize a visita somente apos concluir todas as evidencias obrigatorias.',
      ...stageStatusByKey.FINISH,
    },
  ];
  const currentStageKey: VisitStageKey = visitDetail?.checkOutAt
    ? 'FINISH'
    : !isCheckInStageComplete
      ? 'CHECKIN'
      : !hasBeforePhoto
        ? 'BEFORE'
        : !hasAfterPhoto
          ? 'AFTER'
          : 'FINISH';
  const missingBeforePhotoCount = Math.max(REQUIRED_BEFORE_PHOTOS - beforePhotoCount, 0);
  const finishVisitBlockers = [
    ...(visitDetail ? [] : ['Realize o check-in antes de finalizar a visita.']),
    ...(hasCheckInPhoto ? [] : [CHECKIN_REQUIRED_PHOTO_MESSAGE]),
    ...(missingBeforePhotoCount === 0 ? [] : ['Foto do antes obrigatoria para continuar.']),
    ...(hasAfterPhoto ? [] : ['Foto do depois obrigatoria para encerrar o atendimento.']),
  ];
  const applySelectedVisitState = (
    _nextBundle: PromoterRouteBundleResponse,
    nextVisit: PromoterVisitDetailsResponse | null,
  ) => {
    if (nextVisit?.checkInPhoto && pendingCheckInPhoto) {
      URL.revokeObjectURL(pendingCheckInPhoto.previewUrl);
      setPendingCheckInPhoto(null);
      setIsCheckInPhotoConfirmed(false);
    }
    if (nextVisit) {
      setPendingBeforePhotos((current) => {
        let changed = false;
        const nextPending = { ...current };

        for (const slot of BEFORE_PHOTO_SLOTS) {
          const hasConfirmedPhoto = nextVisit.beforePhotos.some((photo) => photo.category === slot);
          if (hasConfirmedPhoto && current[slot]) {
            URL.revokeObjectURL(current[slot]!.previewUrl);
            nextPending[slot] = null;
            changed = true;
          }
        }

        return changed ? nextPending : current;
      });

      if (nextVisit.afterPhotos.length > 0) {
        setPendingAfterPhoto((current) => {
          if (current) {
            URL.revokeObjectURL(current.previewUrl);
          }

          return null;
        });
      }
    }
    setVisitDetail(nextVisit);
    setCheckInJustification('');
  };

  const handleSessionFailure = async () => {
    clearSession();
    router.replace('/');
  };
  const failSessionInEffect = useEffectEvent(() => {
    clearSession();
    router.replace('/');
  });

  const loadVisitForStop = async (
    routeStopId: string | null,
    visitsSource = todayVisits,
    bundleSource = bundle,
  ) => {
    const nextVisitSummary = findVisitByStop(visitsSource, routeStopId);
    const templateBundle = bundleSource ?? {
      route: null,
      checklistTemplate: [],
      activeJourney: null,
    };

    if (!nextVisitSummary?.visitId) {
      applySelectedVisitState(templateBundle, null);
      return;
    }

    try {
      setLoadingVisit(true);
      const nextVisit = await getPromoterVisit(nextVisitSummary.visitId);
      applySelectedVisitState(templateBundle, nextVisit);
    } catch (loadError) {
      if (isSessionError(loadError)) {
        await handleSessionFailure();
        return;
      }

      applySelectedVisitState(templateBundle, null);
      setActionError(
        loadError instanceof Error ? loadError.message : 'Falha ao carregar os detalhes da visita.',
      );
    } finally {
      setLoadingVisit(false);
    }
  };

  const loadWorkspace = async (preferredStopId?: string | null) => {
    const [nextBundle, nextVisits] = await Promise.all([
      getPromoterRouteBundle(),
      getPromoterTodayVisits(),
    ]);
    const nextSelectedStopId = resolveSelectedStopId(nextBundle, nextVisits, preferredStopId);

    setBundle(nextBundle);
    setTodayVisits(nextVisits);
    setSelectedStopId(nextSelectedStopId);
    await loadVisitForStop(nextSelectedStopId, nextVisits, nextBundle);

    const nextVersion = nextBundle.route?.version ?? null;
    const nextNotificationIds = (nextBundle.notifications ?? []).map((item) => item.id).join('|');

    if (hasLoadedWorkspaceRef.current) {
      if (
        nextVersion !== null &&
        lastKnownRouteVersionRef.current !== null &&
        nextVersion !== lastKnownRouteVersionRef.current
      ) {
        setActionMessage(
          nextBundle.route?.nextInstruction
            ? `Roteiro atualizado. ${nextBundle.route.nextInstruction}`
            : 'Roteiro atualizado pelo supervisor.',
        );
      } else if (
        nextNotificationIds &&
        nextNotificationIds !== lastKnownNotificationIdsRef.current
      ) {
        setActionMessage(nextBundle.notifications?.[0]?.message ?? 'Nova instrucao recebida.');
      }
    }

    lastKnownRouteVersionRef.current = nextVersion;
    lastKnownNotificationIdsRef.current = nextNotificationIds;
    hasLoadedWorkspaceRef.current = true;
  };

  const bootstrapWorkspace = useEffectEvent(async () => {
    setLoading(true);
    setError(null);
    await loadWorkspace();
  });
  const refreshWorkspaceInEffect = useEffectEvent(() => {
    void loadWorkspace(selectedStopId).catch((loadError) => {
      if (isSessionError(loadError)) {
        failSessionInEffect();
        return;
      }

      setTrackingMessage(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao atualizar o roteiro automaticamente.',
      );
    });
  });

  const runBusy = async (label: string, action: () => Promise<void>) => {
    setBusyLabel(label);

    try {
      await action();
    } finally {
      setBusyLabel(null);
    }
  };

  const ensureOnline = () => {
    if (!isOnline) {
      throw new Error('Conecte o aparelho a internet para continuar a operacao pelo navegador.');
    }
  };

  const reloadWorkspace = async (preferredStopId?: string | null) => {
    setActionError(null);
    setActionMessage(null);

    try {
      await loadWorkspace(preferredStopId);
    } catch (loadError) {
      if (isSessionError(loadError)) {
        await handleSessionFailure();
        return;
      }

      throw loadError;
    }
  };

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        await bootstrapWorkspace();
      } catch (loadError) {
        if (!active) {
          return;
        }

        if (isSessionError(loadError)) {
          failSessionInEffect();
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Falha ao carregar o workspace operacional.',
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handlePhotoPickerReturn = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      const pendingPicker = pendingPhotoPickerRef.current;

      if (!pendingPicker || pendingPicker.source !== 'camera') {
        return;
      }

      window.setTimeout(() => {
        if (pendingPhotoPickerRef.current !== pendingPicker) {
          return;
        }

        pendingPhotoPickerRef.current = null;
        setActionError(CAMERA_OPEN_FAILED_MESSAGE);
      }, 250);
    };

    window.addEventListener('focus', handlePhotoPickerReturn);
    document.addEventListener('visibilitychange', handlePhotoPickerReturn);

    return () => {
      pendingPhotoPickerRef.current = null;
      window.removeEventListener('focus', handlePhotoPickerReturn);
      document.removeEventListener('visibilitychange', handlePhotoPickerReturn);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pendingCheckInPhoto) {
        URL.revokeObjectURL(pendingCheckInPhoto.previewUrl);
      }
    };
  }, [pendingCheckInPhoto]);

  useEffect(() => {
    return () => {
      for (const pendingPhoto of Object.values(pendingBeforePhotos)) {
        if (pendingPhoto) {
          URL.revokeObjectURL(pendingPhoto.previewUrl);
        }
      }
    };
  }, [pendingBeforePhotos]);

  useEffect(() => {
    return () => {
      if (pendingAfterPhoto) {
        URL.revokeObjectURL(pendingAfterPhoto.previewUrl);
      }
    };
  }, [pendingAfterPhoto]);

  useEffect(() => {
    if (!isOnline) {
      return;
    }

    const interval = window.setInterval(() => {
      refreshWorkspaceInEffect();
    }, ROUTE_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [isOnline]);

  useEffect(() => {
    lastTrackSentAtRef.current = 0;
    trackingInFlightRef.current = false;

    if (!activeJourney) {
      setTrackingMessage(null);
      return;
    }

    setTrackingMessage('Rastreio da jornada ativo no navegador.');

    return watchBrowserLocation(
      ({ location, accuracyM }) => {
        const now = Date.now();

        if (
          trackingInFlightRef.current ||
          now - lastTrackSentAtRef.current < TRACKING_INTERVAL_MS
        ) {
          return;
        }

        trackingInFlightRef.current = true;

        const payload = trackPointSchema.parse({
          capturedAt: new Date().toISOString(),
          location,
          accuracyM,
          source: 'TRACKING',
          eventId: createWebEventId('track'),
        });

        void sendPromoterTrackPoint(payload)
          .then(() => {
            lastTrackSentAtRef.current = now;
            setTrackingMessage('Rastreio da jornada ativo no navegador.');
          })
          .catch((trackingError) => {
            setTrackingMessage(
              trackingError instanceof Error
                ? trackingError.message
                : 'Falha ao enviar rastreio da jornada.',
            );
          })
          .finally(() => {
            trackingInFlightRef.current = false;
          });
      },
      (message) => {
        setTrackingMessage(message);
      },
    );
  }, [activeJourney]);

  const handleSelectStop = async (stopId: string) => {
    startTransition(() => {
      setSelectedStopId(stopId);
    });
    setActionError(null);
    setActionMessage(null);
    await loadVisitForStop(stopId);
  };

  const handleOpenVisit = async (stopId: string) => {
    setWorkspaceView('visit');
    await handleSelectStop(stopId);
  };

  const handleBackToRoute = () => {
    setWorkspaceView('overview');
    setActionError(null);
  };

  const handleRefresh = async () => {
    try {
      await runBusy('Atualizando...', async () => {
        await reloadWorkspace(selectedStopId);
        setActionMessage('Dados atualizados com sucesso.');
      });
    } catch (refreshError) {
      setActionError(
        refreshError instanceof Error ? refreshError.message : 'Falha ao atualizar os dados.',
      );
    }
  };

  const handleLogout = async () => {
    await runBusy('Encerrando sessao...', async () => {
      await logout();
      router.push('/');
    });
  };

  const handleJourneyToggle = async () => {
    try {
      await runBusy(
        bundle?.activeJourney ? 'Encerrando jornada...' : 'Iniciando jornada...',
        async () => {
          ensureOnline();
          const location = await getBrowserCoordinates();

          if (!bundle?.activeJourney) {
            const payload = startJourneySchema.parse({
              startedAt: new Date().toISOString(),
              location,
              eventId: createWebEventId('journey-start'),
            });

            await startPromoterJourney(payload);
            await reloadWorkspace(selectedStopId);
            setActionMessage('Jornada iniciada no navegador.');
            return;
          }

          const hasOpenVisit =
            todayVisits?.items.some((item) => item.checkInAt && !item.checkOutAt) ?? false;

          if (hasOpenVisit) {
            throw new Error('Finalize a visita em andamento antes de encerrar a jornada.');
          }

          const payload = endJourneySchema.parse({
            endedAt: new Date().toISOString(),
            location,
            eventId: createWebEventId('journey-end'),
          });

          await endPromoterJourney(payload);
          await reloadWorkspace(selectedStopId);
          setActionMessage('Jornada encerrada com sucesso.');
        },
      );
    } catch (journeyError) {
      setActionError(journeyError instanceof Error ? journeyError.message : 'Falha na jornada.');
    }
  };

  const openCheckInConfirmation = () => {
    if (!selectedStop) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setCheckInConfirmationOpen(true);
  };

  const clearPendingCheckInPhoto = () => {
    setPendingCheckInPhoto((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl);
      }

      return null;
    });
    setIsCheckInPhotoConfirmed(false);
  };

  const replacePendingBeforePhoto = (slot: BeforePhotoSlot, file: File) => {
    const nextPhoto = {
      file,
      capturedAt: resolveCapturedAtFromFile(file),
      previewUrl: URL.createObjectURL(file),
    } satisfies PendingEvidencePhoto;

    setPendingBeforePhotos((current) => {
      if (current[slot]) {
        URL.revokeObjectURL(current[slot]!.previewUrl);
      }

      return {
        ...current,
        [slot]: nextPhoto,
      };
    });
  };

  const clearPendingBeforePhoto = (slot: BeforePhotoSlot) => {
    setPendingBeforePhotos((current) => {
      if (!current[slot]) {
        return current;
      }

      URL.revokeObjectURL(current[slot]!.previewUrl);

      return {
        ...current,
        [slot]: null,
      };
    });
  };

  const replacePendingAfterPhoto = (file: File) => {
    const nextPhoto = {
      file,
      capturedAt: resolveCapturedAtFromFile(file),
      previewUrl: URL.createObjectURL(file),
    } satisfies PendingEvidencePhoto;

    setPendingAfterPhoto((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl);
      }

      return nextPhoto;
    });
  };

  const clearPendingAfterPhoto = () => {
    setPendingAfterPhoto((current) => {
      if (!current) {
        return current;
      }

      URL.revokeObjectURL(current.previewUrl);
      return null;
    });
  };

  const replacePendingCheckInPhoto = (file: File) => {
    const nextPhoto = {
      file,
      capturedAt: resolveCapturedAtFromFile(file),
      previewUrl: URL.createObjectURL(file),
    } satisfies PendingCheckInPhoto;

    setPendingCheckInPhoto((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl);
      }

      return nextPhoto;
    });
    setIsCheckInPhotoConfirmed(false);
  };

  const handleCheckInPhotoSelection =
    (source: 'camera' | 'gallery') => (event: ChangeEvent<HTMLInputElement>) => {
      pendingPhotoPickerRef.current = null;

      const file = event.currentTarget.files?.[0] ?? null;

      if (!file) {
        event.currentTarget.value = '';
        return;
      }

      replacePendingCheckInPhoto(file);
      setActionError(null);

      if (source === 'camera') {
        setCheckInConfirmationOpen(true);
      }

      event.currentTarget.value = '';
    };

  const handleAfterPhotoSelection = (event: ChangeEvent<HTMLInputElement>) => {
      pendingPhotoPickerRef.current = null;

      const file = event.currentTarget.files?.[0] ?? null;

      if (!file) {
        event.currentTarget.value = '';
        return;
      }

      replacePendingAfterPhoto(file);
      setActionError(null);
      setActionMessage('Foto do depois pronta para confirmar.');

      event.currentTarget.value = '';
    };

  const handleBeforePhotoSelection =
    (slot: BeforePhotoSlot) => (event: ChangeEvent<HTMLInputElement>) => {
      pendingPhotoPickerRef.current = null;

      const file = event.currentTarget.files?.[0] ?? null;

      if (!file) {
        event.currentTarget.value = '';
        return;
      }

      replacePendingBeforePhoto(slot, file);
      setActionError(null);
      setActionMessage(`${getBeforePhotoSlotLabel()} pronta para confirmar.`);

      event.currentTarget.value = '';
    };

  const handleConfirmCheckInPhoto = () => {
    if (!pendingCheckInPhoto) {
      setActionError(CHECKIN_REQUIRED_PHOTO_MESSAGE);
      return;
    }

    setActionError(null);
    setIsCheckInPhotoConfirmed(true);
  };

  const handleConfirmBeforePhoto = async (slot: BeforePhotoSlot) => {
    const pendingPhoto = pendingBeforePhotos[slot];

    if (!visitDetail || !pendingPhoto) {
      setActionError(`${getBeforePhotoSlotLabel()} ainda nao foi capturada.`);
      return;
    }

    if (beforePhotoBlockerMessage) {
      setActionError(beforePhotoBlockerMessage);
      return;
    }

    try {
      setActionError(null);
      await runBusy('Enviando evidencia...', async () => {
        ensureOnline();

        if (visitDetail.checkOutAt) {
          throw new Error('A visita ja foi finalizada. As evidencias ficaram somente leitura.');
        }

        await uploadPromoterPhoto({
          visitId: visitDetail.id,
          type: 'BEFORE',
          category: slot,
          capturedAt: pendingPhoto.capturedAt,
          file: pendingPhoto.file,
          eventId: createWebEventId(`photo-${slot.toLowerCase()}`),
        });
        await reloadWorkspace(selectedStopId);
        setActionMessage('Foto do antes registrada.');
      });
    } catch (uploadError) {
      setActionError(
        uploadError instanceof Error ? uploadError.message : 'Falha ao enviar evidencia.',
      );
    }
  };

  const handleCheckIn = async () => {
    if (!selectedStop) {
      return;
    }

    if (!pendingCheckInPhoto) {
      setActionError(CHECKIN_REQUIRED_PHOTO_MESSAGE);
      return;
    }

    if (!isCheckInPhotoConfirmed) {
      setActionError(CHECKIN_PHOTO_REVIEW_REQUIRED_MESSAGE);
      return;
    }

    try {
      setActionError(null);
      await runBusy('Registrando check-in...', async () => {
        ensureOnline();

        if (!bundle?.activeJourney) {
          throw new Error('Inicie a jornada antes de realizar check-in.');
        }

        const location = await getBrowserCoordinates();
        const outsideGeofence = !isInsideGeofence(location, selectedStop.client.geofence);

        if (outsideGeofence && !checkInJustification.trim()) {
          throw new Error('Check-in fora da geofence exige justificativa.');
        }

        const payload = checkInSchema.parse({
          routeStopId: selectedStop.id,
          checkedInAt: new Date().toISOString(),
          location,
          justification: checkInJustification.trim() || undefined,
          eventId: createWebEventId('check-in'),
        });

        await checkInPromoterVisitWithPhoto({
          ...payload,
          capturedAt: pendingCheckInPhoto.capturedAt,
          file: pendingCheckInPhoto.file,
          photoEventId: createWebEventId('photo-checkin'),
        });
        setCheckInConfirmationOpen(false);
        await reloadWorkspace(selectedStop.id);
        setActionMessage(`Check-in realizado com sucesso. Registrado as ${formatOperationalTime(payload.checkedInAt)}.`);
      });
    } catch (checkInError) {
      setActionError(
        checkInError instanceof Error
          ? checkInError.message
          : CHECKIN_PHOTO_CONFIRMATION_FAILED_MESSAGE,
      );
    }
  };

  const handleCheckInEvidenceUpload = async (
    file: File | null,
    input: HTMLInputElement,
  ) => {
    pendingPhotoPickerRef.current = null;

    if (!visitDetail || !file) {
      input.value = '';
      return;
    }

    try {
      await runBusy('Enviando evidencia...', async () => {
        ensureOnline();

        if (visitDetail.checkOutAt) {
          throw new Error('A visita ja foi finalizada. As evidencias ficaram somente leitura.');
        }

        await uploadPromoterPhoto({
          visitId: visitDetail.id,
          type: 'BEFORE',
          category: 'CHECKIN_ESTABLISHMENT',
          capturedAt: resolveCapturedAtFromFile(file),
          file,
          eventId: createWebEventId('photo-checkin-retry'),
        });
        await reloadWorkspace(selectedStopId);
        setActionMessage('Foto do estabelecimento registrada com sucesso.');
      });
    } catch (uploadError) {
      setActionError(
        uploadError instanceof Error ? uploadError.message : 'Falha ao enviar evidencia.',
      );
    } finally {
      input.value = '';
    }
  };

  const preparePhotoInput =
    (section: 'CHECKIN' | 'BEFORE' | 'AFTER', source: 'camera' | 'gallery') =>
    (event: ReactMouseEvent<HTMLInputElement>) => {
      setActionError(null);
      setActionMessage(null);

      if (section === 'CHECKIN' && isVisitReadOnly) {
        event.preventDefault();
        setActionError('A visita ja foi finalizada. As evidencias ficaram somente leitura.');
        return;
      }

      if (section === 'BEFORE' && beforePhotoBlockerMessage) {
        event.preventDefault();
        setActionError(beforePhotoBlockerMessage);
        return;
      }

      if (section === 'AFTER' && afterPhotoBlockerMessage) {
        event.preventDefault();
        setActionError(afterPhotoBlockerMessage);
        return;
      }

      if (isVisitReadOnly) {
        event.preventDefault();
        setActionError('A visita ja foi finalizada. As evidencias ficaram somente leitura.');
        return;
      }

      pendingPhotoPickerRef.current = { section, source };
    };

  const handleConfirmAfterPhoto = async () => {
    if (!visitDetail || !pendingAfterPhoto) {
      setActionError('A foto do depois ainda nao foi capturada.');
      return;
    }

    try {
      setActionError(null);
      await runBusy('Enviando evidencia...', async () => {
        ensureOnline();

        if (visitDetail.checkOutAt) {
          throw new Error('A visita ja foi finalizada. As evidencias ficaram somente leitura.');
        }

        if (!hasBeforePhoto) {
          throw new Error('Tire a foto do antes para continuar.');
        }

        await uploadPromoterPhoto({
          visitId: visitDetail.id,
          type: 'AFTER',
          category: 'AFTER_1',
          capturedAt: pendingAfterPhoto.capturedAt,
          file: pendingAfterPhoto.file,
          eventId: createWebEventId('photo-after-1'),
        });
        await reloadWorkspace(selectedStopId);
        setActionMessage('Foto do depois registrada.');
      });
    } catch (uploadError) {
      setActionError(
        uploadError instanceof Error ? uploadError.message : 'Falha ao enviar evidencia.',
      );
    }
  };

  const renderBeforePhotoSlot = (slot: BeforePhotoSlot) => {
    const confirmedPhoto = getBeforePhotoByCategory(slot);
    const pendingPhoto = pendingBeforePhotos[slot];
    const slotLabel = getBeforePhotoSlotLabel();
    const isConfirmed = Boolean(confirmedPhoto);
    const previewUrl = pendingPhoto?.previewUrl ?? (confirmedPhoto ? resolveAssetUrl(confirmedPhoto.url) : null);
    const capturedAt = pendingPhoto?.capturedAt ?? confirmedPhoto?.capturedAt ?? null;

    return (
      <article className="workspace-evidence-slot" key={slot}>
        <div className="workspace-evidence-slot-header">
          <strong>{slotLabel}</strong>
          <span
            className={`workspace-evidence-status ${isConfirmed ? 'workspace-evidence-status-confirmed' : 'workspace-evidence-status-pending'}`}
          >
            {isConfirmed ? `${slotLabel}: confirmada` : `${slotLabel}: pendente`}
          </span>
        </div>

        {beforePhotoBlockerMessage ? (
          <NoticeCard
            title={`${slotLabel} indisponivel`}
            description={beforePhotoBlockerMessage}
            tone="warning"
          />
        ) : null}

        {!isConfirmed ? (
          <label
            className={`button button-primary promoter-photo-action-button${Boolean(
              busyLabel,
            ) || Boolean(beforePhotoBlockerMessage) || isVisitReadOnly ? ' promoter-photo-action-button-disabled' : ''}`}
          >
            <Camera size={16} />
            {pendingPhoto ? 'Tirar novamente' : 'Abrir camera'}
            <input
              className="promoter-photo-action-input"
              type="file"
              accept="image/*"
              capture="environment"
              aria-label="Abrir camera da foto do antes"
              disabled={
                Boolean(busyLabel) || Boolean(beforePhotoBlockerMessage) || isVisitReadOnly
              }
              onClick={preparePhotoInput('BEFORE', 'camera')}
              onChange={handleBeforePhotoSelection(slot)}
            />
          </label>
        ) : null}

        {previewUrl ? (
          <article className="photo-card workspace-photo-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={`${slotLabel} do antes`}
              src={previewUrl}
            />
            <div className="stack">
              <strong>{slotLabel}</strong>
              {capturedAt ? (
                <div className="workspace-photo-metadata">
                  <p className="hint">{`Data: ${formatDate(capturedAt)}`}</p>
                  <p className="hint">{`Hora: ${formatOperationalTime(capturedAt)}`}</p>
                </div>
              ) : null}
            </div>
          </article>
        ) : (
          <EmptyState title={`${slotLabel} pendente`} description="Tire a foto do antes." />
        )}

        {!isConfirmed && pendingPhoto ? (
          <ActionBar className="promoter-visit-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={Boolean(busyLabel)}
              onClick={() => clearPendingBeforePhoto(slot)}
            >
              <RefreshCcw size={16} />
              Tirar novamente
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={Boolean(busyLabel)}
              onClick={() => void handleConfirmBeforePhoto(slot)}
            >
              <CheckCircle2 size={16} />
              Confirmar foto do antes
            </button>
          </ActionBar>
        ) : null}
      </article>
    );
  };

  const renderStageStatus = (label: VisitStageLabel, tone: VisitStageTone) => (
    <span
      className={`workspace-evidence-status ${
        tone === 'confirmed'
          ? 'workspace-evidence-status-confirmed'
          : tone === 'current'
            ? 'workspace-evidence-status-current'
            : tone === 'blocked'
              ? 'workspace-evidence-status-blocked'
            : 'workspace-evidence-status-pending'
      }`}
    >
      {label}
    </span>
  );
  const renderVisitStageStatus = (stageKey: VisitStageKey) =>
    renderStageStatus(stageStatusByKey[stageKey].label, stageStatusByKey[stageKey].tone);

  const renderAfterPhotoSlot = () => {
    const confirmedPhoto = visitDetail?.afterPhotos[0] ?? null;
    const previewUrl =
      pendingAfterPhoto?.previewUrl ?? (confirmedPhoto ? resolveAssetUrl(confirmedPhoto.url) : null);
    const capturedAt = pendingAfterPhoto?.capturedAt ?? confirmedPhoto?.capturedAt ?? null;
    const isConfirmed = Boolean(confirmedPhoto);

    return (
      <article className="workspace-evidence-slot">
        <div className="workspace-evidence-slot-header">
          <strong>Foto do depois</strong>
          <span
            className={`workspace-evidence-status ${isConfirmed ? 'workspace-evidence-status-confirmed' : 'workspace-evidence-status-pending'}`}
          >
            {isConfirmed ? 'Foto do depois: confirmada' : 'Foto do depois: pendente'}
          </span>
        </div>

        {!visitDetail ? (
          <NoticeCard
            title="Check-in necessario"
            description="Faca o check-in para liberar a foto do depois."
            tone="warning"
          />
        ) : null}

        {afterPhotoBlockerMessage ? (
          <NoticeCard
            title="Etapa anterior pendente"
            description={afterPhotoBlockerMessage}
            tone="warning"
          />
        ) : null}

        {!isConfirmed ? (
          <ActionBar className="promoter-visit-actions">
            <label
              className={`button button-primary promoter-photo-action-button${Boolean(
                busyLabel,
              ) || Boolean(afterPhotoBlockerMessage) || !visitDetail || isVisitReadOnly ? ' promoter-photo-action-button-disabled' : ''}`}
            >
              <Camera size={16} />
              {pendingAfterPhoto ? 'Tirar novamente' : 'Abrir camera'}
              <input
                className="promoter-photo-action-input"
                type="file"
                accept="image/*"
                capture="environment"
                aria-label="Abrir camera da foto do depois"
                disabled={
                  Boolean(busyLabel) ||
                  Boolean(afterPhotoBlockerMessage) ||
                  !visitDetail ||
                  isVisitReadOnly
                }
                onClick={preparePhotoInput('AFTER', 'camera')}
                onChange={handleAfterPhotoSelection}
              />
            </label>
          </ActionBar>
        ) : null}

        {previewUrl ? (
          <article className="photo-card workspace-photo-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Foto do depois" src={previewUrl} />
            <div className="stack">
              <strong>Foto do depois</strong>
              {capturedAt ? (
                <div className="workspace-photo-metadata">
                  <p className="hint">{`Data: ${formatDate(capturedAt)}`}</p>
                  <p className="hint">{`Hora: ${formatOperationalTime(capturedAt)}`}</p>
                </div>
              ) : null}
            </div>
          </article>
        ) : (
          <EmptyState title="Foto do depois pendente" description="Tire a foto do depois." />
        )}

        {!isConfirmed && pendingAfterPhoto ? (
          <ActionBar className="promoter-visit-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={Boolean(busyLabel)}
              onClick={clearPendingAfterPhoto}
            >
              <RefreshCcw size={16} />
              Tirar novamente
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={Boolean(busyLabel)}
              onClick={() => void handleConfirmAfterPhoto()}
            >
              <CheckCircle2 size={16} />
              Confirmar foto do depois
            </button>
          </ActionBar>
        ) : null}

        {!isConfirmed && !pendingAfterPhoto && !afterPhotoBlockerMessage ? (
          <p className="hint">
            Se a camera nao abrir, tente novamente. Se ainda falhar, escolha a imagem pela
            galeria.
          </p>
        ) : null}

        {!isConfirmed && !pendingAfterPhoto && !afterPhotoBlockerMessage ? (
          <label
            className={`button button-secondary promoter-photo-action-button${Boolean(
              busyLabel,
            ) || !visitDetail || isVisitReadOnly ? ' promoter-photo-action-button-disabled' : ''}`}
          >
            <ImagePlus size={16} />
            Escolher da galeria
            <input
              className="promoter-photo-action-input"
              type="file"
              accept="image/*"
              aria-label="Escolher foto do depois pela galeria"
              disabled={Boolean(busyLabel) || !visitDetail || isVisitReadOnly}
              onClick={preparePhotoInput('AFTER', 'gallery')}
              onChange={handleAfterPhotoSelection}
            />
          </label>
        ) : null}
      </article>
    );
  };

  const handleFinishVisit = async () => {
    if (!visitDetail) {
      return;
    }

    try {
      await runBusy('Encerrando atendimento...', async () => {
        ensureOnline();

        if (visitDetail.checkOutAt) {
          throw new Error('A visita ja foi finalizada.');
        }

        if (finishVisitBlockers.length > 0) {
          throw new Error('E necessario concluir todas as etapas antes de encerrar o atendimento.');
        }

        const location = await getBrowserCoordinates();
        const payload = checkOutSchema.parse({
          checkedOutAt: new Date().toISOString(),
          location,
          completionStatus: 'COMPLETED',
          eventId: createWebEventId('check-out'),
        });

        await checkOutPromoterVisit(visitDetail.id, payload);
        await reloadWorkspace(selectedStopId);
        setWorkspaceView('overview');
        setActionMessage('Atendimento encerrado com sucesso.');
      });
    } catch (checkOutError) {
      setActionError(
        checkOutError instanceof Error ? checkOutError.message : 'Falha ao encerrar atendimento.',
      );
    }
  };

  if (loading) {
    return <LoadingState message="Carregando operacao do promotor no navegador..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void handleRefresh()} />;
  }

  if (!bundle?.route) {
    return (
      <div className="page-grid">
        <PageHeader
          eyebrow="Promotor no navegador"
          title="Minha rota de hoje"
          description="Nao ha roteiro carregado para hoje. Assim que o supervisor publicar um roteiro, ele aparecera aqui."
          actions={
            <div className="row-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => void handleRefresh()}
              >
                <RefreshCcw size={16} />
                Atualizar
              </button>
              <button
                className="button button-danger"
                type="button"
                onClick={() => void handleLogout()}
              >
                <LogOut size={16} />
                Sair
              </button>
            </div>
          }
        />

        <EmptyState
          title="Nenhum roteiro disponivel"
          description="Publique um roteiro para o promotor e recarregue o portal."
        />
      </div>
    );
  }

  if (workspaceView === 'overview') {
    return (
      <div className="page-grid promoter-route-page">
        <PageHeader
          eyebrow="Promotor no navegador"
          title="Minha rota de hoje"
          description="Veja o proximo cliente, acompanhe a rota do dia e entre no atendimento quando estiver pronto."
          actions={
            <div className="row-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => void handleRefresh()}
              >
                <RefreshCcw size={16} />
                {busyLabel === 'Atualizando...' ? busyLabel : 'Atualizar'}
              </button>
              <button
                className="button button-danger"
                type="button"
                onClick={() => void handleLogout()}
              >
                <LogOut size={16} />
                {busyLabel === 'Encerrando sessao...' ? busyLabel : 'Sair'}
              </button>
            </div>
          }
        />

        <section className="section-card">
          <div className="section-heading">
            <div>
              <h2>Cabecalho do dia</h2>
              <p className="hint">Resumo rapido para o promotor entender o dia em segundos.</p>
            </div>
          </div>

          <div className="promoter-route-summary">
            <div className="list-card">
              <strong>Promotor</strong>
              <p className="hint">{bundle.route.promoterName || user?.name || 'Promotor'}</p>
            </div>
            <div className="list-card">
              <strong>Data</strong>
              <p className="hint">{formatDate(bundle.route.date)}</p>
            </div>
            <div className="list-card">
              <strong>Visitas do dia</strong>
              <p className="hint">{bundle.route.totalStops}</p>
            </div>
            <div className="list-card">
              <strong>Concluidas</strong>
              <p className="hint">{completedVisits}</p>
            </div>
            <div className="list-card">
              <strong>Pendentes</strong>
              <p className="hint">{pendingVisits}</p>
            </div>
          </div>

          {hasRecentRouteUpdate ? (
            <NoticeCard
              title="Sua rota foi atualizada"
              description={
                routeNotifications[0]?.message ??
                actionMessage ??
                'O supervisor publicou uma nova versao da rota de hoje.'
              }
              tone="success"
            />
          ) : null}
        </section>

        <section className="section-card">
          <div className="section-heading">
            <div>
              <h2>Proximo cliente</h2>
              <p className="hint">O promotor deve olhar primeiro para este bloco.</p>
            </div>
          </div>

          {!nextStop ? (
            <EmptyState
              title="Rota concluida"
              description="Nao ha clientes pendentes na rota de hoje."
            />
          ) : (
            <div className="promoter-next-stop-card">
              <div className="promoter-next-stop-sequence">#{nextStop.sequence}</div>
              <div className="promoter-next-stop-copy">
                <strong>{nextStop.client.tradeName}</strong>
                <p className="hint">{nextStop.client.address}</p>
                <p className="hint">
                  {nextStop.client.city}/{nextStop.client.state}
                </p>
              </div>
              <div className="promoter-next-stop-meta">
                <div>
                  <span className="promoter-next-stop-label">Horario previsto</span>
                  <strong>{formatPlannedTime(nextStop.plannedStartAt)}</strong>
                </div>
                <div>
                  <span className="promoter-next-stop-label">Prioridade</span>
                  <span className={getRoutePriorityBadgeClassName(nextStop.priority)}>
                    {getRoutePriorityLabel(nextStop.priority)}
                  </span>
                </div>
                <div>
                  <span className="promoter-next-stop-label">Observacao</span>
                  <p>{nextStop.notes?.trim() || 'Sem observacao do supervisor.'}</p>
                </div>
              </div>

              <button
                className="button button-primary"
                type="button"
                onClick={() => void handleOpenVisit(nextStop.id)}
              >
                Iniciar atendimento
              </button>
            </div>
          )}
        </section>

        <section className="section-card">
          <div className="section-heading">
            <div>
              <h2>Lista da rota do dia</h2>
              <p className="hint">Toque ou clique em uma visita para abrir o detalhe.</p>
            </div>
          </div>

          {routeStops.length === 0 ? (
            <EmptyState
              title="Nenhuma visita programada"
              description="Assim que o supervisor publicar a rota, ela aparecera nesta lista."
            />
          ) : (
            <div className="promoter-route-list">
              {routeStops.map((stop) => {
                const statusValue = getRouteStopStatusValue(stop, todayVisits);

                return (
                  <button
                    key={stop.id}
                    className="promoter-route-list-item"
                    type="button"
                    onClick={() => void handleOpenVisit(stop.id)}
                  >
                    <div className="promoter-route-list-item-header">
                      <span className="sequence-pill">{stop.sequence}</span>
                      <strong>{stop.client.tradeName}</strong>
                    </div>
                    <div className="promoter-route-list-item-meta">
                      <span>Horario: {formatPlannedTime(stop.plannedStartAt)}</span>
                      <span className={getRoutePriorityBadgeClassName(stop.priority)}>
                        {getRoutePriorityLabel(stop.priority)}
                      </span>
                      <span className={statusBadgeClassName(statusValue)}>
                        {getRouteListStatusLabel(statusValue)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="section-card">
          <div className="section-heading">
            <div>
              <h2>Acoes finais</h2>
              <p className="hint">Acompanhe alteracoes e encerre a jornada quando terminar.</p>
            </div>
          </div>

          <ActionBar className="promoter-route-footer-actions">
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setShowRouteUpdates((current) => !current)}
            >
              {showRouteUpdates ? 'Ocultar alteracoes' : 'Ver alteracoes'}
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void handleJourneyToggle()}
              disabled={!activeJourney || Boolean(busyLabel)}
            >
              Encerrar jornada
            </button>
          </ActionBar>

          {showRouteUpdates ? (
            routeNotifications.length > 0 ? (
              <div className="stack">
                {routeNotifications.slice(0, 5).map((notification) => (
                  <NoticeCard
                    key={notification.id}
                    title={notification.title}
                    description={`${notification.message} (${formatDateTime(notification.createdAt)})`}
                  />
                ))}
              </div>
            ) : (
              <NoticeCard
                title="Nenhuma alteracao recente"
                description="O supervisor ainda nao enviou novos avisos para a rota de hoje."
              />
            )
          ) : null}

          {trackingMessage ? <NoticeCard title="Rastreio" description={trackingMessage} /> : null}

          {actionError ? (
            <NoticeCard title="Atencao operacional" description={actionError} tone="warning" />
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="page-grid promoter-visit-page">
      <PageHeader
        eyebrow="Promotor no navegador"
        title="Atendimento da visita"
        description="Siga o fluxo obrigatorio: check-in com foto, foto do antes, foto do depois e encerramento do atendimento."
        actions={
          <div className="row-actions">
            <button
              className="button button-secondary"
              type="button"
              onClick={handleBackToRoute}
            >
              <ArrowLeft size={16} />
              Minha rota
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void handleRefresh()}
            >
              <RefreshCcw size={16} />
              {busyLabel === 'Atualizando...' ? busyLabel : 'Atualizar'}
            </button>
            <button
              className="button button-danger"
              type="button"
              onClick={() => void handleLogout()}
            >
              <LogOut size={16} />
              {busyLabel === 'Encerrando sessao...' ? busyLabel : 'Sair'}
            </button>
          </div>
        }
      />

      {trackingMessage ? <NoticeCard title="Rastreio" description={trackingMessage} /> : null}

      {actionMessage ? (
        <NoticeCard title="Operacao atualizada" description={actionMessage} tone="success" />
      ) : null}

      {actionError ? (
        <NoticeCard title="Atencao operacional" description={actionError} tone="warning" />
      ) : null}

      <section className="section-card">
        <div className="section-heading">
          <div>
            <h2>Etapas</h2>
            <p className="hint">
              {selectedStop
                ? `Cliente: ${selectedStop.client.tradeName}`
                : 'A proxima etapa so e liberada quando a anterior for concluida.'}
            </p>
          </div>
        </div>

        <div className="promoter-visit-progress-grid" aria-label="Passo a passo da visita">
          {visitStages.map((stage) => (
            <article
              key={stage.key}
              data-testid={`visit-stage-${stage.key.toLowerCase()}`}
              className={`promoter-visit-progress-step promoter-visit-progress-step-${stage.tone}`}
            >
              <div className="promoter-visit-progress-step-header">
                <span className="sequence-pill">{stage.step}</span>
                {renderStageStatus(stage.label, stage.tone)}
              </div>
              <strong>{stage.title}</strong>
              <p className="hint">{stage.description}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="promoter-visit-stack">

        <article className="section-card">
          {!selectedStop ? (
            <EmptyState
              title="Selecione uma parada"
              description="Os detalhes operacionais do promotor aparecem aqui."
            />
          ) : (
            <div className="stack">
              <div className="section-heading">
                <div>
                  <h2>Cabecalho da visita</h2>
                  <p className="hint">Resumo do cliente e do atendimento em andamento.</p>
                </div>
                <span className={statusBadgeClassName(selectedStopStatusValue)}>
                  {formatStatusLabel(selectedStopStatusValue)}
                </span>
              </div>

              <div className="promoter-visit-header-grid">
                <div className="list-card promoter-visit-card-span-full">
                  <strong>{selectedStop.client.tradeName}</strong>
                  <p className="hint">
                    {selectedStop.client.address} - {selectedStop.client.city}/
                    {selectedStop.client.state}
                  </p>
                </div>
                <div className="list-card">
                  <strong>Horario previsto</strong>
                  <p className="hint">{formatPlannedTime(selectedStop.plannedStartAt)}</p>
                </div>
                <div className="list-card">
                  <strong>Prioridade</strong>
                  <p className="hint">
                    <span className={getRoutePriorityBadgeClassName(selectedStop.priority)}>
                      {getRoutePriorityLabel(selectedStop.priority)}
                    </span>
                  </p>
                </div>
                <div className="list-card promoter-visit-card-span-full">
                  <strong>Observacao do supervisor</strong>
                  <p className="hint">
                    {selectedStop.notes?.trim() || 'Sem observacao do supervisor.'}
                  </p>
                </div>
              </div>

              {loadingVisit ? (
                <LoadingState message="Carregando detalhes da visita..." />
              ) : (
                <>
                  {isVisitReadOnly ? (
                    <NoticeCard
                      title="Atendimento encerrado"
                      description={`Encerrado em ${formatDateTime(visitDetail?.checkOutAt ?? '')}. A visita ficou somente leitura.`}
                      tone="success"
                    />
                  ) : null}

                  {currentStageKey === 'CHECKIN' ? (
                  <div className="workspace-stage-card">
                    <div className="workspace-stage-header">
                      <div>
                        <strong>Etapa 1 - Check-in</strong>
                        <p className="hint">
                          Faca o check-in com a foto obrigatoria do estabelecimento.
                        </p>
                      </div>
                      {renderVisitStageStatus('CHECKIN')}
                    </div>

                    {!activeJourney ? (
                      <NoticeCard
                        title="Jornada nao iniciada"
                        description="Inicie a jornada para liberar o check-in."
                        tone="warning"
                      />
                    ) : null}

                    <FormField label="Justificativa se estiver fora da geolocalizacao">
                      <textarea
                        className="textarea"
                        placeholder="Explique somente se o check-in acontecer fora da area esperada do cliente."
                        value={checkInJustification}
                        disabled={Boolean(busyLabel) || Boolean(visitDetail)}
                        onChange={(event) => setCheckInJustification(event.target.value)}
                      />
                    </FormField>

                    {visitDetail?.checkInAt ? (
                      <NoticeCard
                        title="Check-in realizado"
                        description={
                          visitDetail.outsideGeofence
                            ? `Registrado em ${formatDateTime(visitDetail.checkInAt)} fora da geofence. Distancia: ${formatDistance(visitDetail.geofenceDistanceM)}.`
                            : `Registrado em ${formatDateTime(visitDetail.checkInAt)} dentro da geofence do cliente.`
                        }
                        tone="success"
                      />
                    ) : (
                      <NoticeCard
                        title="Check-in pendente"
                        description="Foto do estabelecimento obrigatoria para confirmar check-in."
                        tone="warning"
                      />
                    )}

                    {visitDetail && !hasCheckInPhoto ? (
                      <ActionBar className="promoter-visit-actions">
                        <label
                          className={`button button-primary promoter-photo-action-button${Boolean(
                            busyLabel,
                          ) || isVisitReadOnly ? ' promoter-photo-action-button-disabled' : ''}`}
                        >
                          <Camera size={16} />
                          Tirar foto do estabelecimento
                          <input
                            className="promoter-photo-action-input"
                            type="file"
                            accept="image/*"
                            capture="environment"
                            aria-label="Adicionar foto do estabelecimento com a camera"
                            disabled={Boolean(busyLabel) || isVisitReadOnly}
                            onClick={preparePhotoInput('CHECKIN', 'camera')}
                            onChange={(event) =>
                              void handleCheckInEvidenceUpload(
                                event.currentTarget.files?.[0] ?? null,
                                event.currentTarget,
                              )
                            }
                          />
                        </label>
                        <label
                          className={`button button-secondary promoter-photo-action-button${Boolean(
                            busyLabel,
                          ) || isVisitReadOnly ? ' promoter-photo-action-button-disabled' : ''}`}
                        >
                          <ImagePlus size={16} />
                          Escolher da galeria
                          <input
                            className="promoter-photo-action-input"
                            type="file"
                            accept="image/*"
                            aria-label="Escolher foto do estabelecimento pela galeria"
                            disabled={Boolean(busyLabel) || isVisitReadOnly}
                            onClick={preparePhotoInput('CHECKIN', 'gallery')}
                            onChange={(event) =>
                              void handleCheckInEvidenceUpload(
                                event.currentTarget.files?.[0] ?? null,
                                event.currentTarget,
                              )
                            }
                          />
                        </label>
                      </ActionBar>
                    ) : null}

                    {visitDetail?.checkInPhoto ? (
                      <div className="stack">
                        <strong>Foto do estabelecimento</strong>
                        {renderSinglePhotoPreview(
                          visitDetail.checkInPhoto,
                          'Foto do estabelecimento no check-in',
                        )}
                      </div>
                    ) : null}

                    <ActionBar className="promoter-visit-actions">
                      {!activeJourney ? (
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => void handleJourneyToggle()}
                          disabled={Boolean(busyLabel)}
                        >
                          <Navigation size={16} />
                          {busyLabel === 'Iniciando jornada...' ? busyLabel : 'Iniciar jornada'}
                        </button>
                      ) : null}
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={openCheckInConfirmation}
                        disabled={Boolean(busyLabel) || !activeJourney || Boolean(visitDetail)}
                      >
                        <MapPinned size={16} />
                        {busyLabel === 'Registrando check-in...' ? busyLabel : 'Fazer check-in'}
                      </button>
                    </ActionBar>
                  </div>
                  ) : null}

                  {currentStageKey === 'BEFORE' ? (
                  <div className="workspace-stage-card">
                    <div className="workspace-stage-header">
                      <div>
                        <strong>Etapa 2 - Foto do antes</strong>
                        <p className="hint">Tire a foto obrigatoria do antes.</p>
                      </div>
                      {renderVisitStageStatus('BEFORE')}
                    </div>

                    <NoticeCard
                      title="Foto do antes"
                      description={
                        missingBeforePhotoCount > 0
                          ? 'Tire a foto do antes para liberar a etapa seguinte.'
                          : 'Foto do antes confirmada.'
                      }
                      tone={missingBeforePhotoCount > 0 ? 'warning' : 'success'}
                    />

                    <p className="hint promoter-photo-actions-note">
                      {`${CAMERA_PERMISSION_REQUIRED_MESSAGE} Capture e confirme a foto do antes.`}
                    </p>

                    {beforePhotoBlockerMessage ? (
                      <NoticeCard
                        title="Etapa anterior pendente"
                        description={beforePhotoBlockerMessage}
                        tone="warning"
                      />
                    ) : null}

                    <div className="workspace-evidence-slots">
                      {BEFORE_PHOTO_SLOTS.map((slot) => renderBeforePhotoSlot(slot))}
                    </div>

                  </div>
                  ) : null}

                  {currentStageKey === 'AFTER' ? (
                  <div className="workspace-stage-card">
                    <div className="workspace-stage-header">
                      <div>
                        <strong>Etapa 3 - Foto do depois</strong>
                        <p className="hint">Tire a foto do depois para concluir o atendimento.</p>
                      </div>
                      {renderVisitStageStatus('AFTER')}
                    </div>

                    <NoticeCard
                      title="Foto do depois"
                      description={
                        hasAfterPhoto
                          ? 'Foto do depois confirmada.'
                          : 'Tire a foto do depois apos concluir a foto do antes.'
                      }
                      tone={hasAfterPhoto ? 'success' : 'warning'}
                    />

                    <p className="hint promoter-photo-actions-note">
                      {`${CAMERA_PERMISSION_REQUIRED_MESSAGE} Se a camera nao abrir, tente novamente ou escolha uma imagem da galeria.`}
                    </p>

                    {renderAfterPhotoSlot()}

                  </div>
                  ) : null}

                  {currentStageKey === 'FINISH' ? (
                  <div className="workspace-stage-card">
                    <div className="workspace-stage-header">
                      <div>
                        <strong>Etapa 4 - Encerrar atendimento</strong>
                        <p className="hint">
                          O atendimento so pode ser encerrado depois do check-in, foto do antes e foto do depois.
                        </p>
                      </div>
                      {renderVisitStageStatus('FINISH')}
                    </div>

                    {finishVisitBlockers.length > 0 ? (
                      <div className="workspace-warning-list">
                        <div className="workspace-warning-header">
                          <TriangleAlert size={18} />
                          <strong>Pendencias antes do encerramento</strong>
                        </div>
                        {finishVisitBlockers.map((blocker) => (
                          <p key={blocker} className="hint">
                            {blocker}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <NoticeCard
                        title="Etapas obrigatorias concluidas"
                        description="Check-in, foto do antes e foto do depois confirmados. O atendimento ja pode ser encerrado."
                        tone="success"
                      />
                    )}

                    <ActionBar className="promoter-visit-actions">
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={() => void handleFinishVisit()}
                        disabled={Boolean(busyLabel) || isVisitReadOnly || finishVisitBlockers.length > 0}
                      >
                        <CheckCircle2 size={16} />
                        {busyLabel === 'Encerrando atendimento...' ? busyLabel : 'Encerrar atendimento'}
                      </button>
                    </ActionBar>
                  </div>
                  ) : null}
                </>
              )}
            </div>
          )}
        </article>
      </div>

      <ConfirmDialog
        open={checkInConfirmationOpen}
        title="Confirmar check-in"
        description={
          selectedStop ? (
            <div className="stack">
              <p className="hint">
                Para confirmar o check-in, tire uma foto do estabelecimento.
              </p>
              <div className="list-card promoter-visit-card-span-full">
                <strong>{selectedStop.client.tradeName}</strong>
                <p className="hint">
                  {selectedStop.client.address} - {selectedStop.client.city}/{selectedStop.client.state}
                </p>
              </div>
              <NoticeCard
                title="Foto obrigatoria"
                description={CHECKIN_REQUIRED_PHOTO_MESSAGE}
                tone={isCheckInPhotoConfirmed ? 'success' : pendingCheckInPhoto ? 'success' : 'warning'}
              />
              <ActionBar className="promoter-visit-actions">
                <label
                  className={`button button-primary promoter-photo-action-button${Boolean(
                    busyLabel,
                  ) ? ' promoter-photo-action-button-disabled' : ''}`}
                >
                  <Camera size={16} />
                  {pendingCheckInPhoto ? 'Tirar novamente' : 'Abrir camera'}
                  <input
                    className="promoter-photo-action-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    aria-label="Tirar foto do estabelecimento para o check-in"
                    disabled={Boolean(busyLabel)}
                    onClick={preparePhotoInput('CHECKIN', 'camera')}
                    onChange={handleCheckInPhotoSelection('camera')}
                  />
                </label>
                <label
                  className={`button button-secondary promoter-photo-action-button${Boolean(
                    busyLabel,
                  ) ? ' promoter-photo-action-button-disabled' : ''}`}
                >
                  <ImagePlus size={16} />
                  Escolher da galeria
                  <input
                    className="promoter-photo-action-input"
                    type="file"
                    accept="image/*"
                    aria-label="Escolher foto do estabelecimento para o check-in pela galeria"
                    disabled={Boolean(busyLabel)}
                    onClick={preparePhotoInput('CHECKIN', 'gallery')}
                    onChange={handleCheckInPhotoSelection('gallery')}
                  />
                </label>
              </ActionBar>
              <p className="hint promoter-photo-actions-note">
                {`${CAMERA_PERMISSION_REQUIRED_MESSAGE} Se a camera nao abrir, tente novamente ou escolha uma imagem da galeria.`}
              </p>
              {actionError ? (
                <NoticeCard
                  title="Falha ao anexar a foto do check-in"
                  description={`${actionError} Tente novamente.`}
                  tone="warning"
                />
              ) : null}
              {pendingCheckInPhoto ? (
                <article className="photo-card workspace-photo-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="Foto do estabelecimento pronta para confirmar check-in"
                    src={pendingCheckInPhoto.previewUrl}
                  />
                  <div className="stack">
                    <strong>Estabelecimento</strong>
                    <div className="workspace-photo-metadata">
                      <p className="hint">{`Data: ${formatDate(pendingCheckInPhoto.capturedAt)}`}</p>
                      <p className="hint">{`Hora: ${formatOperationalTime(pendingCheckInPhoto.capturedAt)}`}</p>
                    </div>
                    <p className="hint">
                      {`Foto registrada as ${formatDateTime(pendingCheckInPhoto.capturedAt)}`}
                    </p>
                  </div>
                </article>
              ) : null}
              {pendingCheckInPhoto ? (
                <ActionBar className="promoter-visit-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={Boolean(busyLabel)}
                    onClick={handleConfirmCheckInPhoto}
                  >
                    <CheckCircle2 size={16} />
                    {isCheckInPhotoConfirmed ? 'Foto confirmada' : 'Confirmar foto'}
                  </button>
                </ActionBar>
              ) : null}
              {isCheckInPhotoConfirmed && pendingCheckInPhoto ? (
                <NoticeCard
                  title="Foto confirmada"
                  description={`Foto do estabelecimento registrada com sucesso. Check-in liberado para continuar. Data ${formatDate(
                    pendingCheckInPhoto.capturedAt,
                  )} • Hora ${formatOperationalTime(pendingCheckInPhoto.capturedAt)}.`}
                  tone="success"
                />
              ) : null}
            </div>
          ) : (
            'Confirme a chegada para registrar o check-in.'
          )
        }
        confirmLabel={busyLabel === 'Registrando check-in...' ? busyLabel : 'Confirmar check-in'}
        confirmTone="primary"
        confirmDisabled={!pendingCheckInPhoto || !isCheckInPhotoConfirmed || Boolean(busyLabel)}
        onCancel={() => {
          clearPendingCheckInPhoto();
          setCheckInConfirmationOpen(false);
          setActionError(null);
        }}
        onConfirm={() => void handleCheckIn()}
      />
    </div>
  );
};

const renderSinglePhotoPreview = (photo: PromoterVisitPhoto, title: string) => {
  return (
    <article className="photo-card workspace-photo-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={title} src={resolveAssetUrl(photo.url)} />
      <div className="stack">
        <strong>{getPromoterPhotoCategoryLabel(photo.category)}</strong>
        <p className="hint">{`Foto registrada as ${formatDateTime(photo.capturedAt)}`}</p>
      </div>
    </article>
  );
};
