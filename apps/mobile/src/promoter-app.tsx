import { startTransition, useDeferredValue, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import {
  calculateDistanceInMeters,
  canAccessPromoterApp,
  checkInSchema,
  checkOutSchema,
  checklistSubmissionSchema,
  endJourneySchema,
  isInsideGeofence,
  loginSchema,
  startVisitServiceSchema,
  startJourneySchema,
  type VisitCompletionStatus,
} from '@promotor/types';
import {
  ApiError,
  checkInWithPhoto,
  checkOut,
  endJourney,
  getMe,
  getApiDiagnostics,
  login,
  logout,
  probeApiConnection,
  startVisitService,
  startJourney,
  submitChecklist,
  updateVisitNotes,
  uploadPhoto,
} from './lib/api';
import { buildAuthFeedback, createAuthFeedback, type AuthFeedback } from './lib/auth-feedback';
import {
  getAfterPhotoRequirements,
  getBeforePhotoRequirements,
  getCheckoutRequirements,
  getNextVisitAction,
  getStartServiceRequirements,
  getVisitProgress,
  getVisitBlockers,
  getVisitSteps,
  hasPendingVisitSync,
} from './lib/visit-workflow';
import {
  captureOptionalLocation,
  getCurrentCoordinates,
  startActiveJourneyTracking,
} from './lib/location';
import { isOnlineNow, refreshOperationalSnapshot, syncPendingQueue } from './lib/offline';
import { createEventId, createQueueAction } from './lib/offline-helpers';
import type {
  LocalChecklistItem,
  LocalVisitDraft,
  PhotoCategory,
  PhotoVisitStage,
  RouteDayStop,
} from './lib/types';
import {
  PromoterDetailScreenRenderer,
  PromoterRootScreenRenderer,
} from './navigation/promoter-screen-renderer';
import type { DetailScreen, RootTab } from './navigation/promoter-screen-types';
import { localOperationsRepository } from './repositories/local-operations-repository';
import { useAuthStore } from './store/auth-store';
import { useOperationStore } from './store/operation-store';
import { BottomTabs } from './components/mobile-ui';
import { LoginScreen } from './screens/login-screen';
import { palette } from './theme';

const isRecoverableTransportError = (error: unknown) =>
  !(error instanceof ApiError) || error.status >= 500;

const isAuthSessionError = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);

const isVisitClosed = (stop: RouteDayStop, visit?: LocalVisitDraft) =>
  Boolean(visit?.checkOutAt) ||
  visit?.completionStatus === 'COMPLETED' ||
  visit?.completionStatus === 'PARTIAL' ||
  visit?.completionStatus === 'NOT_DONE' ||
  stop.status === 'COMPLETED';

export const PromoterApp = () => {
  const [ready, setReady] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authDiagnosing, setAuthDiagnosing] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [authError, setAuthError] = useState<AuthFeedback | null>(null);
  const [authConnectionMessage, setAuthConnectionMessage] = useState<{
    tone: 'neutral' | 'success' | 'warning' | 'danger';
    text: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [routeUpdateMessage, setRouteUpdateMessage] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<RootTab>('dashboard');
  const [detailScreen, setDetailScreen] = useState<DetailScreen | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const deferredClientSearch = useDeferredValue(clientSearch);
  const syncRunningRef = useRef(false);
  const lastKnownRouteVersionRef = useRef<number | null>(null);
  const lastKnownNotificationIdsRef = useRef('');

  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const updateUser = useAuthStore((state) => state.updateUser);
  const clearSession = useAuthStore((state) => state.clearSession);
  const sessionUserId = user?.id ?? null;

  const route = useOperationStore((state) => state.route);
  const activeJourney = useOperationStore((state) => state.activeJourney);
  const notifications = useOperationStore((state) => state.notifications);
  const visitsByStopId = useOperationStore((state) => state.visitsByStopId);
  const queue = useOperationStore((state) => state.queue);
  const syncLogs = useOperationStore((state) => state.syncLogs);
  const lastSyncAt = useOperationStore((state) => state.lastSyncAt);
  const syncError = useOperationStore((state) => state.syncError);
  const enqueue = useOperationStore((state) => state.enqueue);
  const patchVisit = useOperationStore((state) => state.patchVisit);
  const setActiveJourney = useOperationStore((state) => state.setActiveJourney);
  const resetOperations = useOperationStore((state) => state.resetOperations);

  const currentStop =
    detailScreen && route
      ? (route.stops.find((stop) => stop.id === detailScreen.routeStopId) ?? null)
      : null;
  const currentVisit = currentStop ? visitsByStopId[currentStop.id] : undefined;
  const blockers = currentStop
    ? getVisitBlockers(currentStop, currentVisit, Boolean(activeJourney))
    : [];
  const steps = currentStop ? getVisitSteps(currentStop, currentVisit, Boolean(activeJourney)) : [];
  const currentProgress = getVisitProgress(currentVisit);
  const currentNextAction = getNextVisitAction(currentStop, currentVisit, Boolean(activeJourney));
  const checkoutRequirements = getCheckoutRequirements(currentVisit);
  const nextStop =
    route?.stops.find((stop) => !isVisitClosed(stop, visitsByStopId[stop.id])) ?? null;
  const nextStopVisit = nextStop ? visitsByStopId[nextStop.id] : undefined;
  const nextStopAction = getNextVisitAction(nextStop, nextStopVisit, Boolean(activeJourney));

  const routeStops =
    route?.stops.filter((stop) => {
      const term = deferredClientSearch.trim().toLowerCase();

      if (!term) {
        return true;
      }

      return (
        stop.client.tradeName.toLowerCase().includes(term) ||
        stop.client.address.toLowerCase().includes(term) ||
        stop.client.city.toLowerCase().includes(term) ||
        stop.sequence.toString().includes(term)
      );
    }) ?? [];

  const historyItems = localOperationsRepository.listHistory();
  const apiDiagnostics = getApiDiagnostics();

  useEffect(() => {
    const nextVersion = route?.version ?? null;
    const nextNotificationIds = notifications.map((item) => item.id).join('|');

    if (
      lastKnownRouteVersionRef.current !== null &&
      nextVersion !== null &&
      nextVersion !== lastKnownRouteVersionRef.current
    ) {
      setRouteUpdateMessage(
        route?.nextInstruction
          ? `Roteiro atualizado. ${route.nextInstruction}`
          : 'Roteiro atualizado pelo supervisor.',
      );
    } else if (
      lastKnownNotificationIdsRef.current &&
      nextNotificationIds &&
      nextNotificationIds !== lastKnownNotificationIdsRef.current
    ) {
      setRouteUpdateMessage(notifications[0]?.message ?? 'Nova instrucao recebida.');
    }

    lastKnownRouteVersionRef.current = nextVersion;
    lastKnownNotificationIdsRef.current = nextNotificationIds;
  }, [notifications, route?.nextInstruction, route?.version]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (!sessionUserId) {
        if (!cancelled) {
          setReady(true);
        }
        return;
      }

      try {
        if (await isOnlineNow()) {
          const currentUser = await getMe();

          if (!canAccessPromoterApp(currentUser.role)) {
            clearSession();
            resetOperations();
            if (!cancelled) {
              setAuthError(
                createAuthFeedback(
                  'Este perfil nao usa o app operacional do promotor.',
                  getApiDiagnostics(),
                  ['Entre com um usuario promotor para continuar.'],
                ),
              );
            }
            return;
          }

          updateUser(currentUser);
          if (!cancelled) {
            setAuthError(null);
            setAuthConnectionMessage(null);
          }

          try {
            if (useOperationStore.getState().queue.length > 0) {
              await syncPendingQueue();
            } else {
              await refreshOperationalSnapshot();
            }
          } catch (error) {
            useOperationStore
              .getState()
              .setSyncError(error instanceof Error ? error.message : 'Falha ao carregar o dia');
          }
        }
      } catch (error) {
        if (isAuthSessionError(error)) {
          clearSession();
          resetOperations();
          if (!cancelled) {
            setAuthError(
              createAuthFeedback(
                'Sua sessao expirou. Entre novamente para continuar.',
                getApiDiagnostics(),
                ['A autenticacao anterior nao e mais valida no aparelho.'],
              ),
            );
          }
          return;
        }

        useOperationStore
          .getState()
          .setSyncError(error instanceof Error ? error.message : 'Falha ao carregar o dia');
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [clearSession, resetOperations, sessionUserId, updateUser]);

  useEffect(() => {
    if (!activeJourney) {
      return;
    }

    let removed = false;
    let subscription:
      | {
          remove: () => void;
        }
      | undefined;

    const attachTracking = async () => {
      subscription = await startActiveJourneyTracking((point) => {
        if (removed) {
          return;
        }

        enqueue(
          createQueueAction({
            type: 'TRACK_POINT',
            payload: {
              ...point,
              source: 'TRACKING',
              eventId: createEventId('gps'),
            },
          }),
        );
      });
    };

    void attachTracking();

    return () => {
      removed = true;
      subscription?.remove();
    };
  }, [activeJourney, enqueue]);

  useEffect(() => {
    if (!user || !isOnline || queue.length === 0 || syncRunningRef.current) {
      return;
    }

    syncRunningRef.current = true;

    const sync = async () => {
      try {
        await syncPendingQueue();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : 'Falha ao sincronizar');
      } finally {
        syncRunningRef.current = false;
      }
    };

    void sync();
  }, [isOnline, queue.length, user]);

  useEffect(() => {
    if (!user || !isOnline || queue.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      if (syncRunningRef.current) {
        return;
      }

      syncRunningRef.current = true;
      void syncPendingQueue()
        .catch((error) => {
          setActionError(error instanceof Error ? error.message : 'Falha ao sincronizar');
        })
        .finally(() => {
          syncRunningRef.current = false;
        });
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [isOnline, queue.length, user]);

  useEffect(() => {
    if (!user || !isOnline || queue.length > 0) {
      return;
    }

    const interval = setInterval(() => {
      void refreshOperationalSnapshot().catch((error) => {
        setActionError(error instanceof Error ? error.message : 'Falha ao atualizar o roteiro');
      });
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [isOnline, queue.length, user]);

  const openDetail = (nextScreen: DetailScreen) => {
    setActionError(null);
    startTransition(() => {
      setDetailScreen(nextScreen);
    });
  };

  const closeDetail = () => {
    setActionError(null);
    startTransition(() => {
      setDetailScreen(null);
    });
  };

  const runBusy = async (label: string, action: () => Promise<void>) => {
    setBusyLabel(label);

    try {
      await action();
    } finally {
      setBusyLabel(null);
    }
  };

  const capturePhotoAsset = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      throw new Error('Permissao de camera negada no aparelho. Libere a camera para registrar evidencias.');
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    return result.assets[0];
  };

  const registerPhotoGpsException = (
    stage: PhotoVisitStage,
    message: string,
    visitId?: string,
  ) => {
    const logId = `photo-gps-${Date.now()}`;

    useOperationStore.getState().addSyncLog({
      actionId: logId,
      clientGeneratedId: logId,
      actionType: 'UPLOAD_PHOTO',
      status: 'PENDING',
      message: `${stage}: ${message} A foto foi salva localmente e a excecao seguira para auditoria na sincronizacao.`,
      routeStopId: currentStop?.id,
      visitId,
    });
  };

  const refreshData = async (syncQueueFirst = false, forceSync = false) => {
    if (!user) {
      return;
    }

    if (!(await isOnlineNow())) {
      throw new Error('Sem internet para atualizar agora');
    }

    if (syncQueueFirst && queue.length > 0) {
      await syncPendingQueue({
        force: forceSync,
        source: forceSync ? 'MANUAL' : 'AUTO',
      });
      return;
    }

    await refreshOperationalSnapshot();
  };

  const handleLogin = async (email: string, password: string) => {
    const parsed = loginSchema.safeParse({
      email,
      password,
    });

    if (!parsed.success) {
      setAuthConnectionMessage(null);
      setAuthError(
        createAuthFeedback(
          parsed.error.issues[0]?.message ?? 'Credenciais invalidas',
          getApiDiagnostics(),
          ['Confira se email e senha foram preenchidos corretamente.'],
        ),
      );
      return;
    }

    try {
      setAuthBusy(true);
      setAuthError(null);
      setAuthConnectionMessage(null);
      const session = await login(email, password);

      if (!canAccessPromoterApp(session.user.role)) {
        throw new Error(
          'Este perfil nao acessa o app mobile operacional. Use um usuario promotor.',
        );
      }

      setSession(session);
      useOperationStore.getState().setSyncError(null);
      setReady(true);
    } catch (error) {
      if (isAuthSessionError(error)) {
        clearSession();
        resetOperations();
      }

      setAuthError(buildAuthFeedback(error, getApiDiagnostics()));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleProbeConnection = async () => {
    try {
      setAuthDiagnosing(true);
      setAuthError(null);
      setAuthConnectionMessage({
        tone: 'neutral',
        text: 'Testando conexao com a API...',
      });

      const result = await probeApiConnection();

      setAuthConnectionMessage({
        tone: 'success',
        text: `${result.message} URL: ${result.baseUrl}`,
      });
    } catch (error) {
      setAuthConnectionMessage(null);
      setAuthError(buildAuthFeedback(error, getApiDiagnostics()));
    } finally {
      setAuthDiagnosing(false);
    }
  };

  const handleLogout = async () => {
    await runBusy('Saindo...', async () => {
      await logout();
      resetOperations();
      clearSession();
      setDetailScreen(null);
      setSelectedTab('dashboard');
    });
  };

  const handleRefresh = async () => {
    setActionError(null);

    try {
      await runBusy('Atualizando...', async () => {
        await refreshData(false);
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao atualizar');
    }
  };

  const handleManualSync = async () => {
    setActionError(null);

    try {
      await runBusy('Sincronizando...', async () => {
        await refreshData(true, true);
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao sincronizar');
    }
  };

  const handleJourneyToggle = async () => {
    setActionError(null);

    try {
      await runBusy(activeJourney ? 'Encerrando jornada...' : 'Iniciando jornada...', async () => {
        const openVisits = Object.values(visitsByStopId).filter(
          (visit) => visit.checkInAt && !visit.checkOutAt,
        );

        if (activeJourney && openVisits.length > 0) {
          throw new Error('Finalize a visita em andamento antes de encerrar a jornada');
        }

        const location = await getCurrentCoordinates();

        if (!activeJourney) {
          const eventId = createEventId('journey-start');
          const payload = startJourneySchema.parse({
            startedAt: new Date().toISOString(),
            location,
            eventId,
          });

          const commitOfflineStart = () => {
            enqueue(
              createQueueAction({
                type: 'START_JOURNEY',
                payload,
              }),
            );
            setActiveJourney({
              id: `local-journey-${Date.now()}`,
              promoterId: user?.id ?? 'local-promoter',
              promoterName: user?.name ?? 'Promotor',
              startedAt: payload.startedAt,
              active: true,
            });
          };

          if (await isOnlineNow()) {
            try {
              const response = await startJourney(payload);
              setActiveJourney(response);
            } catch (error) {
              if (!isRecoverableTransportError(error)) {
                throw error;
              }

              commitOfflineStart();
            }
          } else {
            commitOfflineStart();
          }

          return;
        }

        const eventId = createEventId('journey-end');
        const payload = endJourneySchema.parse({
          endedAt: new Date().toISOString(),
          location,
          eventId,
        });

        const commitOfflineEnd = () => {
          enqueue(
            createQueueAction({
              type: 'END_JOURNEY',
              payload,
            }),
          );
          setActiveJourney(null);
          closeDetail();
        };

        if (await isOnlineNow()) {
          if (queue.length > 0) {
            await syncPendingQueue();
          }
          try {
            await endJourney(payload);
            await refreshOperationalSnapshot();
            setActiveJourney(null);
            closeDetail();
          } catch (error) {
            if (!isRecoverableTransportError(error)) {
              throw error;
            }

            commitOfflineEnd();
          }
        } else {
          commitOfflineEnd();
        }
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha na jornada');
    }
  };

  const handleCheckIn = async (justification: string) => {
    if (!currentStop) {
      return;
    }

    setActionError(null);

    try {
      await runBusy('Registrando check-in...', async () => {
        if (!activeJourney) {
          throw new Error('Inicie a jornada antes de realizar check-in');
        }

        const location = await getCurrentCoordinates();
        const outsideGeofence = !isInsideGeofence(location, currentStop.client.geofence);
        const distance = calculateDistanceInMeters(location, {
          latitude: currentStop.client.coordinates.latitude,
          longitude: currentStop.client.coordinates.longitude,
        });

        if (outsideGeofence && !justification.trim()) {
          throw new Error('Check-in fora da geofence exige justificativa');
        }

        const establishmentPhoto = await capturePhotoAsset();

        if (!establishmentPhoto) {
          throw new Error('A foto do estabelecimento e obrigatoria para confirmar o check-in');
        }
        const photoCapturedAt = new Date().toISOString();

        const payload = checkInSchema.parse({
          routeStopId: currentStop.id,
          checkedInAt: new Date().toISOString(),
          location,
          justification: justification.trim() || undefined,
          eventId: createEventId('checkin'),
        });
        const checkInPhotoEventId = createEventId('checkin-photo');

        const commitOffline = async () => {
          const localVisit = localOperationsRepository.createVisitDraft(
            currentStop,
            justification,
            outsideGeofence,
          );
          const { photo } = await localOperationsRepository.addPhoto(
            currentStop.id,
            localVisit.visitId,
            'BEFORE',
            'CHECKIN_ESTABLISHMENT',
            establishmentPhoto,
            {
              capturedAt: photoCapturedAt,
              stage: 'CHECKIN',
              capturedLatitude: location.latitude,
              capturedLongitude: location.longitude,
              gpsStatus: 'CAPTURED',
            },
          );

          patchVisit(currentStop.id, {
            visitId: localVisit.visitId,
            checkInAt: payload.checkedInAt,
            geofenceDistanceM: distance,
            outsideGeofence,
            outsideGeofenceJustification: justification.trim() || undefined,
          });

          enqueue(
            createQueueAction({
              type: 'CHECK_IN',
              localVisitId: localVisit.visitId,
              routeStopId: currentStop.id,
              payload,
            }),
          );

          enqueue(
            createQueueAction({
              type: 'UPLOAD_PHOTO',
              routeStopId: currentStop.id,
              visitId: localVisit.visitId,
              localPhotoId: photo.id,
              payload: {
                visitId: localVisit.visitId,
                type: 'BEFORE',
                category: 'CHECKIN_ESTABLISHMENT',
                stage: photo.stage,
                capturedAt: photo.capturedAt,
                capturedLatitude: photo.capturedLatitude,
                capturedLongitude: photo.capturedLongitude,
                gpsStatus: photo.gpsStatus,
                gpsErrorCode: photo.gpsErrorCode,
                gpsErrorMessage: photo.gpsErrorMessage,
                eventId: checkInPhotoEventId,
                uri: photo.uri,
                fileName: photo.fileName,
                mimeType: photo.mimeType,
              },
            }),
          );
        };

        if (await isOnlineNow()) {
          let response;

          try {
            response = await checkInWithPhoto({
              routeStopId: currentStop.id,
              checkedInAt: payload.checkedInAt,
              capturedAt: photoCapturedAt,
              latitude: location.latitude,
              longitude: location.longitude,
              justification: justification.trim() || undefined,
              eventId: payload.eventId,
              clientGeneratedId: payload.eventId,
              photoEventId: checkInPhotoEventId,
              photoClientGeneratedId: checkInPhotoEventId,
              photoCapturedLatitude: location.latitude,
              photoCapturedLongitude: location.longitude,
              photoGpsStatus: 'CAPTURED',
              uri: establishmentPhoto.uri,
              fileName: establishmentPhoto.fileName ?? `checkin-${Date.now()}.jpg`,
              mimeType: establishmentPhoto.mimeType ?? 'image/jpeg',
            });
          } catch (error) {
            if (!isRecoverableTransportError(error)) {
              throw error;
            }

            await commitOffline();
            response = null;
          }

          if (response) {
            const localVisit = localOperationsRepository.createVisitDraft(
              currentStop,
              justification,
              outsideGeofence,
            );
            const { photo } = await localOperationsRepository.addPhoto(
              currentStop.id,
              response.id,
              'BEFORE',
              'CHECKIN_ESTABLISHMENT',
              establishmentPhoto,
              {
                capturedAt: photoCapturedAt,
                stage: 'CHECKIN',
                capturedLatitude: location.latitude,
                capturedLongitude: location.longitude,
                gpsStatus: 'CAPTURED',
              },
            );

            patchVisit(currentStop.id, {
              visitId: response.id,
              journeyId: response.journeyId,
              status: response.status,
              operationalStatus: response.operationalStatus,
              completionStatus: response.completionStatus ?? undefined,
              checkInAt: response.checkInAt,
              geofenceDistanceM: response.geofenceDistanceM ?? distance,
              outsideGeofence: response.outsideGeofence,
              outsideGeofenceJustification:
                response.outsideGeofenceJustification ?? (justification.trim() || undefined),
              localOnly: false,
              pendingSync: false,
              lastSyncedAt: new Date().toISOString(),
            });

            useOperationStore.getState().setVisitIdMapping(localVisit.visitId, response.id);
            useOperationStore
              .getState()
              .markPhotoUploaded(currentStop.id, photo.id, response.checkInPhoto?.url ?? photo.uri);
          }
        } else {
          await commitOffline();
        }

        openDetail({
          name: 'visit-detail',
          routeStopId: currentStop.id,
        });
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha no check-in');
    }
  };

  const handleStartService = async () => {
    if (!currentStop || !currentVisit) {
      setActionError('Realize o check-in antes de iniciar o atendimento');
      return;
    }

    setActionError(null);

    try {
      await runBusy('Iniciando atendimento...', async () => {
        if (currentVisit.checkOutAt) {
          throw new Error('A visita ja foi finalizada');
        }

        const missingRequirements = getStartServiceRequirements(currentVisit);

        if (missingRequirements.length > 0) {
          throw new Error(
            `Nao e possivel iniciar o atendimento sem ${missingRequirements.join(', ')}`,
          );
        }

        const startedAt = new Date().toISOString();
        const body = startVisitServiceSchema.parse({
          startedAt,
          eventId: createEventId('visit-service-start'),
        });

        const queueStartService = () => {
          localOperationsRepository.markVisitServiceStarted(currentStop.id, startedAt);
          enqueue(
            createQueueAction({
              type: 'START_SERVICE',
              routeStopId: currentStop.id,
              visitId: currentVisit.visitId,
              payload: {
                visitId: currentVisit.visitId,
                body,
              },
            }),
          );
        };

        if ((await isOnlineNow()) && !currentVisit.visitId.startsWith('local-')) {
          try {
            const response = await startVisitService(currentVisit.visitId, body);
            patchVisit(currentStop.id, {
              serviceStartedAt: response.serviceStartedAt ?? startedAt,
              pendingSync: false,
              localOnly: false,
              lastSyncedAt: new Date().toISOString(),
            });
          } catch (error) {
            if (!isRecoverableTransportError(error)) {
              throw error;
            }

            queueStartService();
          }
        } else {
          queueStartService();
        }
      });

      openDetail({
        name: 'photos-before',
        routeStopId: currentStop.id,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao iniciar atendimento');
    }
  };

  const handleCapturePhoto = async (photoType: 'BEFORE' | 'AFTER', category: PhotoCategory) => {
    if (!currentStop || !currentVisit) {
      setActionError('Realize o check-in antes de registrar fotos');
      return;
    }

    setActionError(null);

    try {
      await runBusy('Capturando foto...', async () => {
        if (currentVisit.checkOutAt) {
          throw new Error('A visita ja foi finalizada');
        }

        if (!currentVisit.checkInPhoto) {
          throw new Error('Refaca o check-in com a foto do estabelecimento antes de continuar');
        }

        const missingRequirements =
          photoType === 'BEFORE'
            ? getBeforePhotoRequirements(currentVisit)
            : getAfterPhotoRequirements(currentVisit);

        if (missingRequirements.length > 0) {
          throw new Error(
            `Nao e possivel continuar sem ${missingRequirements.join(', ')}`,
          );
        }

        const photoAsset = await capturePhotoAsset();

        if (!photoAsset) {
          return;
        }

        const photoLocation = await captureOptionalLocation();

        const { photo } = await localOperationsRepository.addPhoto(
          currentStop.id,
          currentVisit.visitId,
          photoType,
          category,
          photoAsset,
          {
            stage: photoType === 'AFTER' ? 'AFTER' : 'BEFORE',
            capturedAt: new Date().toISOString(),
            capturedLatitude:
              photoLocation.status === 'CAPTURED'
                ? photoLocation.location.latitude
                : undefined,
            capturedLongitude:
              photoLocation.status === 'CAPTURED'
                ? photoLocation.location.longitude
                : undefined,
            gpsStatus: photoLocation.status,
            gpsErrorCode:
              photoLocation.status === 'CAPTURED'
                ? undefined
                : photoLocation.errorCode,
            gpsErrorMessage:
              photoLocation.status === 'CAPTURED'
                ? undefined
                : photoLocation.message,
          },
        );
        const uploadEventId = createEventId('photo-upload');

        if (photoLocation.status !== 'CAPTURED') {
          registerPhotoGpsException(photo.stage, photoLocation.message, currentVisit.visitId);
        }

        const queueUpload = () => {
          enqueue(
            createQueueAction({
              type: 'UPLOAD_PHOTO',
              routeStopId: currentStop.id,
              visitId: currentVisit.visitId,
              localPhotoId: photo.id,
              payload: {
                visitId: currentVisit.visitId,
                type: photoType,
                category,
                stage: photo.stage,
                capturedAt: photo.capturedAt,
                capturedLatitude: photo.capturedLatitude,
                capturedLongitude: photo.capturedLongitude,
                gpsStatus: photo.gpsStatus,
                gpsErrorCode: photo.gpsErrorCode,
                gpsErrorMessage: photo.gpsErrorMessage,
                eventId: uploadEventId,
                uri: photo.uri,
                fileName: photo.fileName,
                mimeType: photo.mimeType,
              },
            }),
          );
        };

        if ((await isOnlineNow()) && !currentVisit.visitId.startsWith('local-')) {
          try {
            const response = await uploadPhoto({
              visitId: currentVisit.visitId,
              type: photoType,
              category,
              stage: photo.stage,
              capturedAt: photo.capturedAt,
              capturedLatitude: photo.capturedLatitude,
              capturedLongitude: photo.capturedLongitude,
              gpsStatus: photo.gpsStatus,
              gpsErrorCode: photo.gpsErrorCode,
              gpsErrorMessage: photo.gpsErrorMessage,
              eventId: uploadEventId,
              clientGeneratedId: uploadEventId,
              uri: photo.uri,
              fileName: photo.fileName,
              mimeType: photo.mimeType,
            });

            useOperationStore.getState().markPhotoUploaded(currentStop.id, photo.id, response.url);
          } catch (error) {
            if (!isRecoverableTransportError(error)) {
              throw error;
            }

            queueUpload();
          }
        } else {
          queueUpload();
        }
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao capturar foto');
    }
  };

  const handleChecklistDraftChange = (items: LocalChecklistItem[]) => {
    if (!currentStop || currentVisit?.checkOutAt) {
      return;
    }

    localOperationsRepository.updateChecklistDraft(currentStop.id, items);
  };

  const handleChecklistSubmit = async (items: LocalChecklistItem[]) => {
    if (!currentStop || !currentVisit) {
      setActionError('Realize o check-in antes do checklist');
      return;
    }

    setActionError(null);

    try {
      await runBusy('Salvando checklist...', async () => {
        if (currentVisit.checkOutAt) {
          throw new Error('A visita ja foi finalizada');
        }

        if (!currentVisit.checkInPhoto) {
          throw new Error('A foto do estabelecimento do check-in e obrigatoria');
        }

        if (!currentVisit.serviceStartedAt) {
          throw new Error('Inicie o atendimento antes de salvar a execucao');
        }

        if (currentVisit.beforePhotos.length === 0) {
          throw new Error('Pelo menos uma foto de antes e obrigatoria');
        }

        const body = checklistSubmissionSchema.parse({
          items,
          notes: currentVisit.notes || undefined,
          eventId: createEventId('checklist'),
        });

        localOperationsRepository.updateChecklistDraft(currentStop.id, items);

        const queueChecklist = () => {
          localOperationsRepository.completeChecklist(currentStop.id);
          enqueue(
            createQueueAction({
              type: 'SUBMIT_CHECKLIST',
              routeStopId: currentStop.id,
              visitId: currentVisit.visitId,
              payload: {
                visitId: currentVisit.visitId,
                body,
              },
            }),
          );
        };

        if ((await isOnlineNow()) && !currentVisit.visitId.startsWith('local-')) {
          try {
            await submitChecklist(currentVisit.visitId, body);
            patchVisit(currentStop.id, {
              checklistCompleted: true,
              checklistSyncedAt: new Date().toISOString(),
              pendingSync: false,
              lastSyncedAt: new Date().toISOString(),
            });
          } catch (error) {
            if (
              !isRecoverableTransportError(error) &&
              !currentVisit.beforePhotos.some((photo) => !photo.uploaded)
            ) {
              throw error;
            }

            queueChecklist();
          }
        } else {
          queueChecklist();
        }
      });

      openDetail({
        name: 'photos-after',
        routeStopId: currentStop.id,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha no checklist');
    }
  };

  const handleNotesDraftChange = (notes: string) => {
    if (!currentStop || currentVisit?.checkOutAt) {
      return;
    }

    localOperationsRepository.saveVisitNotes(currentStop.id, notes);
  };

  const handleNotesSubmit = async (notes: string) => {
    if (!currentStop || !currentVisit) {
      setActionError('Realize o check-in antes de salvar observacoes');
      return;
    }

    setActionError(null);

    try {
      await runBusy('Salvando observacoes...', async () => {
        if (currentVisit.checkOutAt) {
          throw new Error('A visita ja foi finalizada');
        }

        localOperationsRepository.saveVisitNotes(currentStop.id, notes);

        if (!notes.trim()) {
          return;
        }

        const queueNotes = () => {
          patchVisit(currentStop.id, {
            pendingSync: true,
          });
          enqueue(
            createQueueAction({
              type: 'UPDATE_NOTES',
              routeStopId: currentStop.id,
              visitId: currentVisit.visitId,
              payload: {
                visitId: currentVisit.visitId,
                notes: notes.trim(),
              },
            }),
          );
        };

        if ((await isOnlineNow()) && !currentVisit.visitId.startsWith('local-')) {
          try {
            await updateVisitNotes(currentVisit.visitId, notes.trim());
            patchVisit(currentStop.id, {
              pendingSync: false,
              lastSyncedAt: new Date().toISOString(),
            });
          } catch (error) {
            if (!isRecoverableTransportError(error)) {
              throw error;
            }

            queueNotes();
          }
        } else {
          queueNotes();
        }
      });

      openDetail({
        name: 'visit-detail',
        routeStopId: currentStop.id,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao salvar observacoes');
    }
  };

  const handleCheckOut = async (completionStatus: VisitCompletionStatus, notes: string) => {
    if (!currentStop || !currentVisit) {
      setActionError('Realize o check-in antes de finalizar');
      return;
    }

    setActionError(null);

    try {
      await runBusy('Finalizando visita...', async () => {
        if (currentVisit.checkOutAt) {
          throw new Error('A visita ja foi finalizada');
        }

        const missingRequirements = getCheckoutRequirements(currentVisit);

        if (missingRequirements.length > 0) {
          throw new Error(`Visita nao pode ser concluida sem ${missingRequirements.join(', ')}`);
        }

        localOperationsRepository.saveVisitNotes(currentStop.id, notes);
        const location = await getCurrentCoordinates();
        const body = checkOutSchema.parse({
          checkedOutAt: new Date().toISOString(),
          location,
          completionStatus,
          notes: notes.trim() || undefined,
          eventId: createEventId('checkout'),
        });

        const queueCheckout = () => {
          localOperationsRepository.markVisitCheckedOut(
            currentStop.id,
            completionStatus,
            body.checkedOutAt,
          );
          enqueue(
            createQueueAction({
              type: 'CHECK_OUT',
              routeStopId: currentStop.id,
              visitId: currentVisit.visitId,
              payload: {
                visitId: currentVisit.visitId,
                body,
              },
            }),
          );
        };

        if ((await isOnlineNow()) && !currentVisit.visitId.startsWith('local-')) {
          try {
            const response = await checkOut(currentVisit.visitId, body);
            patchVisit(currentStop.id, {
              status: response.status,
              operationalStatus: response.operationalStatus,
              completionStatus: response.completionStatus ?? undefined,
              serviceStartedAt: response.serviceStartedAt ?? currentVisit.serviceStartedAt,
              checkOutAt: response.checkOutAt ?? body.checkedOutAt,
              totalDurationSeconds: response.totalDurationSeconds ?? undefined,
              executionDurationSeconds: response.executionDurationSeconds ?? undefined,
              pendingSync: false,
              localOnly: false,
              lastSyncedAt: new Date().toISOString(),
            });
          } catch (error) {
            const hasUnsyncedDependencies =
              currentVisit.beforePhotos.some((photo) => !photo.uploaded) ||
              currentVisit.afterPhotos.some((photo) => !photo.uploaded) ||
              currentVisit.localOnly;

            if (!isRecoverableTransportError(error) && !hasUnsyncedDependencies) {
              throw error;
            }

            queueCheckout();
          }
        } else {
          queueCheckout();
        }
      });

      closeDetail();
      setSelectedTab('clients');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha no check-out');
    }
  };

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.canvas,
        }}
      >
        <ActivityIndicator color={palette.accent} size="large" />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (!user) {
    return (
      <>
        <StatusBar style="dark" />
        <LoginScreen
          busy={authBusy}
          configuredApiBaseUrl={apiDiagnostics.configuredBaseUrl}
          activeApiBaseUrl={apiDiagnostics.activeBaseUrl}
          connectionMessage={authConnectionMessage}
          diagnosing={authDiagnosing}
          error={authError}
          initialEmail="promotor.centro@formula.local"
          initialPassword="Promotor@123"
          onProbeConnection={() => void handleProbeConnection()}
          onSubmit={(email, password) => void handleLogin(email, password)}
        />
      </>
    );
  }

  const footer = detailScreen ? undefined : (
    <BottomTabs
      onChange={(value) => {
        setActionError(null);
        setSelectedTab(value);
      }}
      value={selectedTab}
    />
  );

  const renderRootScreen = () => (
    <PromoterRootScreenRenderer
      activeJourney={activeJourney}
      busyLabel={busyLabel}
      hasActiveJourney={Boolean(activeJourney)}
      historyItems={historyItems}
      isOnline={isOnline}
      lastSyncAt={lastSyncAt}
      nextStop={nextStop}
      nextStopAction={nextStopAction}
      notifications={notifications}
      onJourneyToggle={() => void handleJourneyToggle()}
      onLogout={() => void handleLogout()}
      onOpenClients={() => setSelectedTab('clients')}
      onOpenHistory={() => setSelectedTab('history')}
      onOpenNextVisit={(routeStopId) =>
        openDetail({
          name: 'visit-detail',
          routeStopId,
        })
      }
      onOpenSync={() => setSelectedTab('sync')}
      onOpenVisit={(routeStopId) =>
        openDetail({
          name: 'visit-detail',
          routeStopId,
        })
      }
      onRefresh={() => void handleRefresh()}
      onSearchChange={setClientSearch}
      onSync={() => void handleManualSync()}
      queue={queue}
      route={route}
      routeStops={routeStops}
      routeUpdateMessage={routeUpdateMessage}
      search={clientSearch}
      selectedTab={selectedTab}
      syncError={actionError ?? syncError}
      syncLogs={syncLogs}
      userName={user.name}
      visitsByStopId={visitsByStopId}
    />
  );

  const renderDetailScreen = () => (
    <PromoterDetailScreenRenderer
      actionError={actionError}
      blockers={blockers}
      busyLabel={busyLabel}
      checkoutRequirements={checkoutRequirements}
      currentStop={currentStop}
      currentVisit={currentVisit}
      detailScreen={detailScreen}
      nextAction={currentNextAction}
      onBackToRoot={closeDetail}
      onCapturePhoto={(photoType, category) =>
        void handleCapturePhoto(photoType, category)
      }
      onCheckIn={(justification) => void handleCheckIn(justification)}
      onCheckOut={(status, notes) => void handleCheckOut(status, notes)}
      onChecklistDraftChange={handleChecklistDraftChange}
      onChecklistSubmit={(items) => void handleChecklistSubmit(items)}
      onNotesDraftChange={handleNotesDraftChange}
      onNotesSubmit={(notes) => void handleNotesSubmit(notes)}
      onOpenDashboard={() => {
        closeDetail();
        setSelectedTab('dashboard');
      }}
      onOpenDetail={openDetail}
      onStartService={() => void handleStartService()}
      pendingSync={hasPendingVisitSync(currentVisit, queue)}
      progress={currentProgress}
      renderRootFallback={renderRootScreen}
      steps={steps}
    />
  );

  return (
    <>
      <StatusBar style="dark" />
      {detailScreen ? renderDetailScreen() : renderRootScreen()}
      {footer}
    </>
  );
};
