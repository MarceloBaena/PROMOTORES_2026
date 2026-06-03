import { readPublicUrl } from '@promotor/config';
import type {
  CheckInInput,
  ChecklistSubmissionInput,
  CheckOutInput,
  EndJourneyInput,
  JourneySummary,
  SyncPushResponse as SharedSyncPushResponse,
  SyncPushResult as SharedSyncPushResult,
  StartVisitServiceInput,
  StartJourneyInput,
  TrackPointInput,
  UserRole,
} from '@promotor/types';
import Constants from 'expo-constants';
import { useAuthStore } from '../store/auth-store';
import type {
  PhotoGpsStatus,
  PhotoCategory,
  PhotoVisitStage,
  QueueAction,
  RouteBundle,
  TodayVisitsResponse,
  VisitDetailsResponse,
} from './types';

type SessionPayload = {
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  };
  accessToken: string;
  refreshToken: string;
};

export type ApiDiagnostics = {
  configuredBaseUrl: string;
  activeBaseUrl: string | null;
  candidateBaseUrls: string[];
};

export interface SyncPushResult extends SharedSyncPushResult {
  clientGeneratedId: string;
  actionType: Exclude<QueueAction['type'], 'UPLOAD_PHOTO'>;
  status: 'SYNCED' | 'FAILED';
  processedAt: string;
  serverEntityId?: string | null;
}

export interface SyncPushResponse
  extends Omit<SharedSyncPushResponse, 'results' | 'snapshot'> {
  results: SyncPushResult[];
  snapshot: RouteBundle;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

let refreshInFlight: Promise<SessionPayload> | null = null;
let activeApiBaseUrl: string | null = null;

const DEFAULT_API_BASE_URL = 'http://localhost:3333/api';
const REQUEST_TIMEOUT_MS = 15000;
const NETWORK_ERROR_MESSAGE =
  'Nao foi possivel conectar com a API. Verifique se o aparelho esta na mesma rede da maquina e se a API esta rodando.';

const normalizeErrorMessage = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return 'Falha ao comunicar com a API';
  }

  if (!('message' in payload)) {
    return 'Falha ao comunicar com a API';
  }

  const { message } = payload as { message?: unknown };

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return typeof message === 'string' ? message : 'Falha ao comunicar com a API';
};

const normalizeUrl = (value: string) => value.replace(/\/+$/, '');

const shouldBypassTunnelReminder = (baseUrl: string) =>
  /\.loca\.lt(?:\/|$)/i.test(baseUrl) || /\.localtunnel\.me(?:\/|$)/i.test(baseUrl);

const extractHostFromUri = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).hostname;
  } catch {
    const sanitized = trimmed.replace(/^[a-z]+:\/\//i, '');
    const hostCandidate = sanitized.split('/')[0]?.split(':')[0];
    return hostCandidate?.trim() || null;
  }
};

const getConfiguredApiBaseUrl = () =>
  normalizeUrl(readPublicUrl(process.env.EXPO_PUBLIC_API_BASE_URL, DEFAULT_API_BASE_URL));

const getExpoHostCandidates = () => {
  const expoGoConfig = Constants.expoGoConfig as { debuggerHost?: string } | null;

  return [
    extractHostFromUri(Constants.expoConfig?.hostUri),
    extractHostFromUri(Constants.linkingUri),
    extractHostFromUri(expoGoConfig?.debuggerHost),
  ].filter((value): value is string => Boolean(value));
};

const buildApiBaseUrlCandidates = () => {
  const urls = new Set<string>();
  const configuredBaseUrl = getConfiguredApiBaseUrl();

  urls.add(configuredBaseUrl);

  for (const host of getExpoHostCandidates()) {
    urls.add(`http://${host}:3333/api`);
  }

  urls.add('http://10.0.2.2:3333/api');
  urls.add(DEFAULT_API_BASE_URL);
  urls.add('http://127.0.0.1:3333/api');

  const candidates = [...urls].map(normalizeUrl);

  if (activeApiBaseUrl) {
    return [activeApiBaseUrl, ...candidates.filter((candidate) => candidate !== activeApiBaseUrl)];
  }

  return candidates;
};

const isNetworkFailure = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  return /network request failed|failed to fetch|fetch failed|load failed/i.test(error.message);
};

const isTransportFailure = (error: unknown) =>
  isNetworkFailure(error) || (error instanceof ApiError && error.status === 0);

const safelyParseJson = (raw: string) => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

const parseResponse = async <T>(response: Response) => {
  const raw = await response.text();
  const payload = safelyParseJson(raw);

  if (!response.ok) {
    throw new ApiError(normalizeErrorMessage(payload), response.status, payload);
  }

  return payload as T;
};

const fetchWithTimeout = async (url: string, init: RequestInit) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(
        `A API nao respondeu em ${Math.round(REQUEST_TIMEOUT_MS / 1000)} segundos`,
        0,
        {
          reason: 'TIMEOUT',
          timeoutMs: REQUEST_TIMEOUT_MS,
          url,
        },
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const rawRequest = async <T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> => {
  const candidateBaseUrls = buildApiBaseUrlCandidates();
  let lastNetworkError: unknown = null;

  for (const baseUrl of candidateBaseUrls) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}${path}`, {
        ...init,
        headers: {
          ...(shouldBypassTunnelReminder(baseUrl) ? { 'bypass-tunnel-reminder': 'true' } : {}),
          ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers ?? {}),
        },
      });

      activeApiBaseUrl = baseUrl;
      return await parseResponse<T>(response);
    } catch (error) {
      if (isTransportFailure(error)) {
        lastNetworkError = error;

        if (activeApiBaseUrl === baseUrl) {
          activeApiBaseUrl = null;
        }

        continue;
      }

      throw error;
    }
  }

  throw new ApiError(NETWORK_ERROR_MESSAGE, 0, {
    reason:
      lastNetworkError instanceof ApiError && lastNetworkError.details
        ? lastNetworkError.details
        : lastNetworkError instanceof Error
          ? lastNetworkError.message
          : lastNetworkError,
    attemptedBaseUrls: candidateBaseUrls,
    path,
  });
};

export const login = (email: string, password: string) =>
  rawRequest<SessionPayload>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

const refreshSession = (refreshToken: string) => {
  if (!refreshInFlight) {
    refreshInFlight = rawRequest<SessionPayload>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }).finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
};

const authorizedRequest = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const { accessToken, refreshToken, setSession, clearSession } = useAuthStore.getState();
  let activeAccessToken = accessToken;

  if (!activeAccessToken) {
    if (!refreshToken) {
      throw new ApiError('Sessao expirada', 401);
    }

    try {
      const refreshed = await refreshSession(refreshToken);
      setSession(refreshed);
      activeAccessToken = refreshed.accessToken;
    } catch (error) {
      clearSession();
      throw error;
    }
  }

  try {
    return await rawRequest<T>(path, init, activeAccessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !refreshToken) {
      throw error;
    }

    const refreshed = await refreshSession(refreshToken);
    setSession(refreshed);

    try {
      return await rawRequest<T>(path, init, refreshed.accessToken);
    } catch (requestError) {
      clearSession();
      throw requestError;
    }
  }
};

export const fetchRouteBundle = () => authorizedRequest<RouteBundle>('/route-plans/today');

export const fetchTodayVisits = () =>
  authorizedRequest<TodayVisitsResponse>('/visits/today?page=1&pageSize=100');

export const fetchVisit = (visitId: string) =>
  authorizedRequest<VisitDetailsResponse>(`/visits/${visitId}`);

export const getMe = () =>
  authorizedRequest<{
    id: string;
    name: string;
    email: string;
    role: UserRole;
  }>('/auth/me');

export const startJourney = (payload: StartJourneyInput) =>
  authorizedRequest<JourneySummary>('/journeys/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const sendTrackPoint = (payload: TrackPointInput) =>
  authorizedRequest('/operations/journey/track', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const endJourney = (payload: EndJourneyInput) =>
  authorizedRequest<JourneySummary>('/journeys/end', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const checkIn = (payload: CheckInInput) =>
  authorizedRequest<VisitDetailsResponse>('/visits/check-in', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const checkInWithPhoto = async (input: {
  routeStopId: string;
  checkedInAt: string;
  capturedAt: string;
  latitude: number;
  longitude: number;
  photoCapturedLatitude?: number;
  photoCapturedLongitude?: number;
  photoGpsStatus?: PhotoGpsStatus;
  photoGpsErrorCode?: string;
  photoGpsErrorMessage?: string;
  justification?: string;
  eventId?: string;
  photoEventId?: string;
  clientGeneratedId?: string;
  photoClientGeneratedId?: string;
  uri: string;
  fileName: string;
  mimeType: string;
}) => {
  const formData = new FormData();
  formData.append('routeStopId', input.routeStopId);
  formData.append('checkedInAt', input.checkedInAt);
  formData.append('capturedAt', input.capturedAt);
  formData.append('latitude', String(input.latitude));
  formData.append('longitude', String(input.longitude));

  if (typeof input.photoCapturedLatitude === 'number') {
    formData.append('photoCapturedLatitude', String(input.photoCapturedLatitude));
  }

  if (typeof input.photoCapturedLongitude === 'number') {
    formData.append('photoCapturedLongitude', String(input.photoCapturedLongitude));
  }

  if (input.photoGpsStatus) {
    formData.append('photoGpsStatus', input.photoGpsStatus);
  }

  if (input.photoGpsErrorCode) {
    formData.append('photoGpsErrorCode', input.photoGpsErrorCode);
  }

  if (input.photoGpsErrorMessage) {
    formData.append('photoGpsErrorMessage', input.photoGpsErrorMessage);
  }

  if (input.justification?.trim()) {
    formData.append('justification', input.justification.trim());
  }

  if (input.eventId) {
    formData.append('eventId', input.eventId);
  }

  if (input.clientGeneratedId) {
    formData.append('clientGeneratedId', input.clientGeneratedId);
  }

  if (input.photoEventId) {
    formData.append('photoEventId', input.photoEventId);
  }

  if (input.photoClientGeneratedId) {
    formData.append('photoClientGeneratedId', input.photoClientGeneratedId);
  }

  formData.append('file', {
    uri: input.uri,
    name: input.fileName,
    type: input.mimeType,
  } as unknown as Blob);

  return authorizedRequest<VisitDetailsResponse>('/operations/visits/check-in-with-photo', {
    method: 'POST',
    body: formData,
  });
};

export const submitChecklist = (visitId: string, body: ChecklistSubmissionInput) =>
  authorizedRequest<VisitDetailsResponse>(`/visits/${visitId}/checklist`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const startVisitService = (visitId: string, body: StartVisitServiceInput) =>
  authorizedRequest<VisitDetailsResponse>(`/operations/visits/${visitId}/start-service`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateVisitNotes = (visitId: string, notes: string) =>
  authorizedRequest<VisitDetailsResponse>(`/visits/${visitId}/notes`, {
    method: 'PUT',
    body: JSON.stringify({ notes }),
  });

export const checkOut = (visitId: string, body: CheckOutInput) =>
  authorizedRequest<VisitDetailsResponse>(`/visits/${visitId}/check-out`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const uploadPhoto = async (input: {
  visitId: string;
  type: 'BEFORE' | 'AFTER';
  category: PhotoCategory;
  stage: PhotoVisitStage;
  capturedAt: string;
  capturedLatitude?: number;
  capturedLongitude?: number;
  gpsStatus?: PhotoGpsStatus;
  gpsErrorCode?: string;
  gpsErrorMessage?: string;
  eventId?: string;
  clientGeneratedId?: string;
  uri: string;
  fileName: string;
  mimeType: string;
}) => {
  const formData = new FormData();
  formData.append('file', {
    uri: input.uri,
    name: input.fileName,
    type: input.mimeType,
  } as unknown as Blob);

  const queryParts = [
    `type=${encodeURIComponent(input.type)}`,
    `category=${encodeURIComponent(input.category)}`,
    `stage=${encodeURIComponent(input.stage)}`,
    `capturedAt=${encodeURIComponent(input.capturedAt)}`,
  ];

  if (typeof input.capturedLatitude === 'number') {
    queryParts.push(`capturedLatitude=${encodeURIComponent(String(input.capturedLatitude))}`);
  }

  if (typeof input.capturedLongitude === 'number') {
    queryParts.push(`capturedLongitude=${encodeURIComponent(String(input.capturedLongitude))}`);
  }

  if (input.gpsStatus) {
    queryParts.push(`gpsStatus=${encodeURIComponent(input.gpsStatus)}`);
  }

  if (input.gpsErrorCode) {
    queryParts.push(`gpsErrorCode=${encodeURIComponent(input.gpsErrorCode)}`);
  }

  if (input.gpsErrorMessage) {
    queryParts.push(`gpsErrorMessage=${encodeURIComponent(input.gpsErrorMessage)}`);
  }

  if (input.eventId) {
    queryParts.push(`eventId=${encodeURIComponent(input.eventId)}`);
  }

  if (input.clientGeneratedId) {
    queryParts.push(`clientGeneratedId=${encodeURIComponent(input.clientGeneratedId)}`);
  }

  return authorizedRequest<{
    id: string;
    type: 'BEFORE' | 'AFTER';
    category: PhotoCategory;
    stage?: PhotoVisitStage;
    url: string;
    capturedAt: string;
    capturedLatitude?: number | null;
    capturedLongitude?: number | null;
    gpsStatus?: PhotoGpsStatus | null;
    gpsErrorCode?: string | null;
    gpsErrorMessage?: string | null;
  }>(
    `/operations/visits/${input.visitId}/photos?${queryParts.join('&')}`,
    {
      method: 'POST',
      body: formData,
    },
  );
};

export const pushSyncBatch = (input: {
  deviceId?: string;
  pushedAt: string;
  routeDate?: string;
  lastPulledAt?: string;
  actions: Array<{
    id: string;
    clientGeneratedId: string;
    type: Exclude<QueueAction['type'], 'UPLOAD_PHOTO'>;
    payload: unknown;
  }>;
}) =>
  authorizedRequest<SyncPushResponse>('/sync/push', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const logout = async () => {
  const { refreshToken, clearSession } = useAuthStore.getState();

  if (refreshToken) {
    try {
      await rawRequest('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // local cleanup remains sufficient
    }
  }

  clearSession();
};

export const getApiDiagnostics = (): ApiDiagnostics => ({
  configuredBaseUrl: getConfiguredApiBaseUrl(),
  activeBaseUrl: activeApiBaseUrl,
  candidateBaseUrls: buildApiBaseUrlCandidates(),
});

export const probeApiConnection = async () => {
  try {
    await rawRequest('/auth/me');

    return {
      reachable: true,
      status: 200,
      baseUrl: getApiDiagnostics().activeBaseUrl ?? getConfiguredApiBaseUrl(),
      message: 'API respondeu com sucesso.',
    } as const;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return {
        reachable: true,
        status: 401,
        baseUrl: getApiDiagnostics().activeBaseUrl ?? getConfiguredApiBaseUrl(),
        message: 'API respondeu e exigiu autenticacao, o que e esperado sem token.',
      } as const;
    }

    throw error;
  }
};

export const resetApiBaseUrlCacheForTests = () => {
  activeApiBaseUrl = null;
  refreshInFlight = null;
};
