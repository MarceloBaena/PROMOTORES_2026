'use client';

import { readPublicUrl } from '@promotor/config';
import type {
  CheckInInput,
  ChecklistSubmissionInput,
  CheckOutInput,
  EndJourneyInput,
  JourneySummary,
  LoginInput,
  StartJourneyInput,
  TrackPointInput,
} from '@promotor/types';
import { useAuthStore, type SessionPayload } from './auth-store';
import type {
  ActivateAllInactiveCustomersResponse,
  ApplyRouteTemplateInput,
  AuditLogListResponse,
  AlertsListResponse,
  BatchRoutePlanInput,
  CollaboratorCreateInput,
  CollaboratorDetailResponse,
  CollaboratorsListResponse,
  CollaboratorInput,
  CustomerImportBatchDetail,
  CustomerImportBatchItemsResponse,
  CustomerImportBatchesResponse,
  CustomerDetailResponse,
  CustomerInput,
  CustomerStatus,
  CustomerStatusUpdateResponse,
  CustomersListResponse,
  DashboardResponse,
  EvidenceListResponse,
  OperationalMapResponse,
  PromotersListResponse,
  ReportsResponse,
  RoutePlanDetailResponse,
  RoutePlanHistoryResponse,
  RoutePlanInput,
  RoutePlansListResponse,
  RouteTemplateDetailResponse,
  RouteTemplateInput,
  RouteTemplatesListResponse,
  SyncPendenciesListResponse,
  TeamListResponse,
  TeamDetailResponse,
  TeamInput,
  TeamMembersResponse,
  TeamStatus,
  TeamStatusUpdateResponse,
  TeamsListResponse,
  VisitDetailResponse,
  VisitsListResponse,
} from './types';
import type {
  PhotoCategory,
  PromoterPhotoUploadResponse,
  PromoterRouteBundleResponse,
  PromoterTodayVisitsResponse,
  PromoterVisitDetailsResponse,
} from './promoter-types';

const API_BASE_URL = readPublicUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL,
  'http://localhost:3333/api',
);
const BROWSER_API_PROXY_BASE_PATH = '/backend-api';
const BROWSER_UPLOADS_PROXY_BASE_PATH = '/backend-uploads';

const LOCAL_API_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

let refreshInFlight: Promise<SessionPayload> | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

type QueryValue = string | number | boolean | null | undefined;

export const resolveApiBaseUrl = (
  configuredBaseUrl: string,
  browserHostname?: string | null,
  browserProtocol?: string | null,
) => {
  const normalizedBaseUrl = configuredBaseUrl.replace(/\/+$/, '');

  try {
    const url = new URL(normalizedBaseUrl);

    if (
      !browserHostname ||
      LOCAL_API_HOSTS.has(browserHostname) ||
      !LOCAL_API_HOSTS.has(url.hostname)
    ) {
      return normalizedBaseUrl;
    }

    url.hostname = browserHostname;

    if (browserProtocol === 'http:' || browserProtocol === 'https:') {
      url.protocol = browserProtocol;
    }

    return url.toString().replace(/\/+$/, '');
  } catch {
    return normalizedBaseUrl;
  }
};

const getApiBaseUrl = () =>
  typeof window === 'undefined'
    ? resolveApiBaseUrl(API_BASE_URL, null, null)
    : BROWSER_API_PROXY_BASE_PATH;

export const getBrowserApiBasePath = () => BROWSER_API_PROXY_BASE_PATH;

const parseResponse = async <T>(response: Response) => {
  const raw = await response.text();
  const payload = raw ? safelyParseJson(raw) : null;

  if (!response.ok) {
    throw new ApiError(extractApiErrorMessage(payload), response.status, payload);
  }

  return payload as T;
};

const safelyParseJson = (raw: string) => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

const extractApiErrorMessage = (payload: unknown) => {
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  if (typeof payload === 'object' && payload !== null && 'message' in payload) {
    const message = payload.message;

    if (Array.isArray(message)) {
      return message.map(String).join(' | ');
    }

    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return 'Falha ao comunicar com a API';
};

const request = async <T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string | null,
): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    throw new ApiError(
      'Nao foi possivel conectar ao servidor. Verifique se o dispositivo esta na mesma rede e tente novamente.',
      0,
      error,
    );
  }

  return parseResponse<T>(response);
};

const refresh = (refreshToken: string) =>
  request<SessionPayload>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });

const refreshSession = async (refreshToken: string) => {
  if (!refreshInFlight) {
    refreshInFlight = refresh(refreshToken)
      .then((session) => {
        useAuthStore.getState().setSession(session);
        return session;
      })
      .catch((error) => {
        useAuthStore.getState().clearSession();
        throw error;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
};

const authorizedRequest = async <T>(path: string, init: RequestInit = {}) => {
  const { accessToken, refreshToken } = useAuthStore.getState();

  if (!accessToken) {
    if (!refreshToken) {
      throw new ApiError('Sessao expirada', 401);
    }

    const refreshed = await refreshSession(refreshToken);
    return request<T>(path, init, refreshed.accessToken);
  }

  try {
    return await request<T>(path, init, accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !refreshToken) {
      throw error;
    }

    const refreshed = await refreshSession(refreshToken);
    return await request<T>(path, init, refreshed.accessToken);
  }
};

const buildQueryString = (query?: Record<string, QueryValue>) => {
  const params = new URLSearchParams();

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
};

export const login = (body: LoginInput) =>
  request<SessionPayload>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const logout = async () => {
  const { refreshToken, clearSession } = useAuthStore.getState();

  if (refreshToken) {
    try {
      await request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // local cleanup is enough for the dashboard
    }
  }

  clearSession();
};

export const getMe = () => authorizedRequest<SessionPayload['user']>('/auth/me');

export const getPromoterRouteBundle = () =>
  authorizedRequest<PromoterRouteBundleResponse>('/route-plans/today');

export const getPromoterTodayVisits = () =>
  authorizedRequest<PromoterTodayVisitsResponse>('/visits/today?page=1&pageSize=100');

export const getPromoterVisit = (visitId: string) =>
  authorizedRequest<PromoterVisitDetailsResponse>(`/visits/${visitId}`);

export const startPromoterJourney = (body: StartJourneyInput) =>
  authorizedRequest<JourneySummary>('/journeys/start', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const sendPromoterTrackPoint = (body: TrackPointInput) =>
  authorizedRequest('/operations/journey/track', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const endPromoterJourney = (body: EndJourneyInput) =>
  authorizedRequest<JourneySummary>('/journeys/end', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const checkInPromoterVisit = (body: CheckInInput) =>
  authorizedRequest<PromoterVisitDetailsResponse>('/visits/check-in', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const checkInPromoterVisitWithPhoto = async (input: {
  routeStopId: string;
  checkedInAt: string;
  capturedAt: string;
  location: {
    latitude: number;
    longitude: number;
  };
  file: File;
  justification?: string;
  eventId?: string;
  photoEventId?: string;
}) => {
  const formData = new FormData();
  formData.append('file', input.file, input.file.name);
  formData.append('routeStopId', input.routeStopId);
  formData.append('checkedInAt', input.checkedInAt);
  formData.append('capturedAt', input.capturedAt);
  formData.append('latitude', String(input.location.latitude));
  formData.append('longitude', String(input.location.longitude));

  if (input.justification) {
    formData.append('justification', input.justification);
  }

  if (input.eventId) {
    formData.append('eventId', input.eventId);
  }

  if (input.photoEventId) {
    formData.append('photoEventId', input.photoEventId);
  }

  return authorizedRequest<PromoterVisitDetailsResponse>('/operations/visits/check-in-with-photo', {
    method: 'POST',
    body: formData,
  });
};

export const submitPromoterChecklist = (visitId: string, body: ChecklistSubmissionInput) =>
  authorizedRequest<PromoterVisitDetailsResponse>(`/visits/${visitId}/checklist`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updatePromoterVisitNotes = (visitId: string, notes: string) =>
  authorizedRequest<PromoterVisitDetailsResponse>(`/visits/${visitId}/notes`, {
    method: 'PUT',
    body: JSON.stringify({ notes }),
  });

export const checkOutPromoterVisit = (visitId: string, body: CheckOutInput) =>
  authorizedRequest<PromoterVisitDetailsResponse>(`/visits/${visitId}/check-out`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const uploadPromoterPhoto = async (input: {
  visitId: string;
  type: 'BEFORE' | 'AFTER';
  category: PhotoCategory;
  capturedAt: string;
  file: File;
  eventId?: string;
}) => {
  const formData = new FormData();
  formData.append('file', input.file, input.file.name);

  return authorizedRequest<PromoterPhotoUploadResponse>(
    `/operations/visits/${input.visitId}/photos?type=${input.type}&category=${input.category}&capturedAt=${encodeURIComponent(input.capturedAt)}${input.eventId ? `&eventId=${encodeURIComponent(input.eventId)}` : ''}`,
    {
      method: 'POST',
      body: formData,
    },
  );
};

export const getDashboard = (query?: Record<string, QueryValue>) =>
  authorizedRequest<DashboardResponse>(`/supervisor/dashboard${buildQueryString(query)}`);

export const getOperationalMap = (query?: Record<string, QueryValue>) =>
  authorizedRequest<OperationalMapResponse>(`/supervisor/map${buildQueryString(query)}`);

export const getTeam = (query?: Record<string, QueryValue>) =>
  authorizedRequest<TeamListResponse>(`/supervisor/team${buildQueryString(query)}`);

export const getTeams = (query?: Record<string, QueryValue>) =>
  authorizedRequest<TeamsListResponse>(`/teams${buildQueryString(query)}`);

export const getTeamDetail = (teamId: string) =>
  authorizedRequest<TeamDetailResponse>(`/teams/${teamId}`);

export const createTeam = (body: TeamInput) =>
  authorizedRequest<TeamDetailResponse>('/teams', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateTeam = (teamId: string, body: TeamInput) =>
  authorizedRequest<TeamDetailResponse>(`/teams/${teamId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const updateTeamStatus = (teamId: string, status: TeamStatus) =>
  authorizedRequest<TeamStatusUpdateResponse>(`/teams/${teamId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

export const getTeamMembers = (teamId: string) =>
  authorizedRequest<TeamMembersResponse>(`/teams/${teamId}/members`);

export const addTeamMembers = (teamId: string, promoterIds: string[]) =>
  authorizedRequest<TeamMembersResponse>(`/teams/${teamId}/members`, {
    method: 'POST',
    body: JSON.stringify({ promoterIds }),
  });

export const removeTeamMember = (teamId: string, memberId: string) =>
  authorizedRequest<{ teamId: string; memberId: string; promoterId: string; removed: boolean }>(
    `/teams/${teamId}/members/${memberId}`,
    {
      method: 'DELETE',
    },
  );

export const getVisits = (query?: Record<string, QueryValue>) =>
  authorizedRequest<VisitsListResponse>(`/supervisor/visits${buildQueryString(query)}`);

export const getVisitDetail = (visitId: string) =>
  authorizedRequest<VisitDetailResponse>(`/supervisor/visits/${visitId}`);

export const getAlerts = (query?: Record<string, QueryValue>) =>
  authorizedRequest<AlertsListResponse>(`/supervisor/alerts${buildQueryString(query)}`);

export const resolveAlert = (alertId: string, note?: string) =>
  authorizedRequest<{ id: string; resolvedAt?: string | null; active: boolean }>(
    `/supervisor/alerts/${alertId}/resolve`,
    {
      method: 'PUT',
      body: JSON.stringify({
        note,
      }),
    },
  );

export const getEvidences = (query?: Record<string, QueryValue>) =>
  authorizedRequest<EvidenceListResponse>(`/supervisor/evidences${buildQueryString(query)}`);

export const getReports = (query?: Record<string, QueryValue>) =>
  authorizedRequest<ReportsResponse>(`/supervisor/reports${buildQueryString(query)}`);

export const getAuditLogs = (query?: Record<string, QueryValue>) =>
  authorizedRequest<AuditLogListResponse>(`/supervisor/audit${buildQueryString(query)}`);

export const getSyncPendencies = (query?: Record<string, QueryValue>) =>
  authorizedRequest<SyncPendenciesListResponse>(
    `/supervisor/sync-pendencies${buildQueryString(query)}`,
  );

export const getPromoters = (query?: Record<string, QueryValue>) =>
  authorizedRequest<PromotersListResponse>(`/promoters${buildQueryString(query)}`);

export const getCustomers = (query?: Record<string, QueryValue>) =>
  authorizedRequest<CustomersListResponse>(`/customers${buildQueryString(query)}`);

export const getCustomer = (customerId: string) =>
  authorizedRequest<CustomerDetailResponse>(`/customers/${customerId}`);

export const createCustomer = (body: CustomerInput) =>
  authorizedRequest<CustomerDetailResponse>('/customers', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateCustomer = (customerId: string, body: CustomerInput) =>
  authorizedRequest<CustomerDetailResponse>(`/customers/${customerId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const updateCustomerStatus = (customerId: string, status: CustomerStatus) =>
  authorizedRequest<CustomerStatusUpdateResponse>(`/customers/${customerId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

export const activateAllInactiveCustomers = () =>
  authorizedRequest<ActivateAllInactiveCustomersResponse>('/customers/activate-all-inactive', {
    method: 'PATCH',
  });

export const archiveCustomer = (customerId: string) => updateCustomerStatus(customerId, 'INACTIVE');

export const importCustomersCsv = (input: {
  file: File;
  apply?: boolean;
  allowCreate?: boolean;
  allowUpdate?: boolean;
  ignoreDuplicates?: boolean;
  delimiter?: string;
  fallbackSupervisorUserId?: string;
  fallbackDefaultPromoterUserId?: string;
}) => {
  const formData = new FormData();
  formData.append('file', input.file, input.file.name);

  if (input.apply !== undefined) {
    formData.append('apply', String(input.apply));
  }

  if (input.allowCreate !== undefined) {
    formData.append('allowCreate', String(input.allowCreate));
  }

  if (input.allowUpdate !== undefined) {
    formData.append('allowUpdate', String(input.allowUpdate));
  }

  if (input.ignoreDuplicates !== undefined) {
    formData.append('ignoreDuplicates', String(input.ignoreDuplicates));
  }

  if (input.delimiter) {
    formData.append('delimiter', input.delimiter);
  }

  if (input.fallbackSupervisorUserId) {
    formData.append('fallbackSupervisorUserId', input.fallbackSupervisorUserId);
  }

  if (input.fallbackDefaultPromoterUserId) {
    formData.append('fallbackDefaultPromoterUserId', input.fallbackDefaultPromoterUserId);
  }

  return authorizedRequest<CustomerImportBatchDetail>('/customers/import/csv', {
    method: 'POST',
    body: formData,
  });
};

export const importCustomersWinthor = (body: {
  apply?: boolean;
  allowCreate?: boolean;
  allowUpdate?: boolean;
  ignoreDuplicates?: boolean;
  changedSince?: string;
  fallbackSupervisorUserId?: string;
  fallbackDefaultPromoterUserId?: string;
}) =>
  authorizedRequest<CustomerImportBatchDetail>('/customers/import/winthor', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const syncCustomersFromWinthor = (body: {
  allowCreate?: boolean;
  allowUpdate?: boolean;
  ignoreDuplicates?: boolean;
  changedSince?: string;
  fallbackSupervisorUserId?: string;
  fallbackDefaultPromoterUserId?: string;
}) =>
  authorizedRequest<CustomerImportBatchDetail>('/customers/sync/winthor', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getCustomerImportBatches = (query?: Record<string, QueryValue>) =>
  authorizedRequest<CustomerImportBatchesResponse>(
    `/customers/import/batches${buildQueryString(query)}`,
  );

export const getCustomerImportBatch = (batchId: string) =>
  authorizedRequest<CustomerImportBatchDetail>(`/customers/import/batches/${batchId}`);

export const getCustomerImportBatchItems = (batchId: string, query?: Record<string, QueryValue>) =>
  authorizedRequest<CustomerImportBatchItemsResponse>(
    `/customers/import/batches/${batchId}/items${buildQueryString(query)}`,
  );

export const getRoutePlans = (query?: Record<string, QueryValue>) =>
  authorizedRequest<RoutePlansListResponse>(`/route-plans${buildQueryString(query)}`);

export const getRoutePlan = (routePlanId: string) =>
  authorizedRequest<RoutePlanDetailResponse>(`/route-plans/${routePlanId}`);

export const createRoutePlan = (body: RoutePlanInput) =>
  authorizedRequest<RoutePlanDetailResponse>('/route-plans', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const createRoutePlansBatch = (body: BatchRoutePlanInput) =>
  authorizedRequest<{
    count: number;
    createdCount: number;
    updatedCount: number;
    items: Array<{
      id: string;
      routeDate: string;
      action: 'created' | 'updated';
    }>;
  }>('/route-plans/batch', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateRoutePlan = (routePlanId: string, body: RoutePlanInput) =>
  authorizedRequest<RoutePlanDetailResponse>(`/route-plans/${routePlanId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const publishRoutePlan = (routePlanId: string, note?: string) =>
  authorizedRequest<RoutePlanDetailResponse>(`/route-plans/${routePlanId}/publish`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });

export const getRoutePlanHistory = (routePlanId: string) =>
  authorizedRequest<RoutePlanHistoryResponse>(`/route-plans/${routePlanId}/history`);

export const archiveRoutePlan = (routePlanId: string) =>
  authorizedRequest<{ id: string; archived: boolean }>(`/route-plans/${routePlanId}`, {
    method: 'DELETE',
  });

export const getRouteTemplates = (query?: Record<string, QueryValue>) =>
  authorizedRequest<RouteTemplatesListResponse>(`/route-plans/templates${buildQueryString(query)}`);

export const getRouteTemplate = (routeTemplateId: string) =>
  authorizedRequest<RouteTemplateDetailResponse>(`/route-plans/templates/${routeTemplateId}`);

export const createRouteTemplate = (body: RouteTemplateInput) =>
  authorizedRequest<RouteTemplateDetailResponse>('/route-plans/templates', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateRouteTemplate = (routeTemplateId: string, body: RouteTemplateInput) =>
  authorizedRequest<RouteTemplateDetailResponse>(`/route-plans/templates/${routeTemplateId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const applyRouteTemplate = (routeTemplateId: string, body: ApplyRouteTemplateInput) =>
  authorizedRequest<{
    routeTemplateId: string;
    count: number;
    createdCount: number;
    updatedCount: number;
    items: Array<{
      id: string;
      routeDate: string;
      action: 'created' | 'updated';
    }>;
  }>(`/route-plans/templates/${routeTemplateId}/apply`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getCollaborators = (query?: Record<string, QueryValue>) =>
  authorizedRequest<CollaboratorsListResponse>(`/collaborators${buildQueryString(query)}`);

export const getCollaborator = (collaboratorId: string) =>
  authorizedRequest<CollaboratorDetailResponse>(`/collaborators/${collaboratorId}`);

export const createCollaborator = (body: CollaboratorCreateInput) =>
  authorizedRequest<CollaboratorDetailResponse>('/collaborators', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateCollaborator = (collaboratorId: string, body: CollaboratorInput) =>
  authorizedRequest<CollaboratorDetailResponse>(`/collaborators/${collaboratorId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const updateCollaboratorStatus = (
  collaboratorId: string,
  status: CollaboratorInput['status'],
) =>
  authorizedRequest<CollaboratorDetailResponse>(`/collaborators/${collaboratorId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

export const resetCollaboratorPassword = (collaboratorId: string, newPassword: string) =>
  authorizedRequest<{ id: string; passwordReset: boolean }>(
    `/collaborators/${collaboratorId}/reset-password`,
    {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    },
  );

export const resolveAssetUrl = (value: string) => {
  if (/^https?:\/\//.test(value)) {
    return value;
  }

  if (typeof window !== 'undefined') {
    const normalizedPath = value.startsWith('/') ? value : `/${value}`;
    const proxiedPath = normalizedPath.startsWith('/uploads/')
      ? normalizedPath.replace('/uploads/', `${BROWSER_UPLOADS_PROXY_BASE_PATH}/`)
      : normalizedPath;

    return `${window.location.origin}${proxiedPath}`;
  }

  const apiBaseUrl = getApiBaseUrl();
  const origin = apiBaseUrl.endsWith('/api') ? apiBaseUrl.slice(0, -4) : apiBaseUrl;
  return `${origin}${value.startsWith('/') ? value : `/${value}`}`;
};
