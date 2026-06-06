declare const process: {
  env?: {
    EXPO_PUBLIC_API_BASE_URL?: string;
  };
};

const PRODUCTION_API_BASE_URL = "https://promotores-2026-api.vercel.app";

function resolveApiBaseUrl() {
  const configuredUrl = process.env?.EXPO_PUBLIC_API_BASE_URL?.trim();

  if (configuredUrl && !configuredUrl.includes("URL-DA-API")) {
    return configuredUrl.replace(/\/$/, "");
  }

  return PRODUCTION_API_BASE_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "SUPERVISOR" | "PROMOTOR";
  status: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export interface ClientSnapshot {
  id: string;
  code?: string | null;
  name: string;
  document?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
}

export interface RouteItemSnapshot {
  id: string;
  routeId: string;
  clientId: string;
  sequence: number;
  status: string;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  client: ClientSnapshot;
}

export interface RouteSnapshot {
  id: string;
  name: string;
  status: string;
  scheduledDate?: string | null;
  items: RouteItemSnapshot[];
}

export interface MobileSnapshot {
  downloadedAt: string;
  promoter: {
    id: string;
    code: number;
    name: string;
    email: string;
  };
  routes: RouteSnapshot[];
  clients: ClientSnapshot[];
}

async function parseApiError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return body?.error?.message ?? `Erro HTTP ${response.status}`;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password })
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json() as Promise<LoginResponse>;
}

export async function downloadMobileSnapshot(accessToken: string): Promise<MobileSnapshot> {
  const response = await fetch(`${API_BASE_URL}/mobile/snapshot`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const body = await response.json() as { data: MobileSnapshot };
  return body.data;
}

export async function postJson<TResponse>(
  accessToken: string,
  path: string,
  payload: Record<string, unknown>,
  method = "POST"
) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json() as Promise<TResponse>;
}

export async function uploadVisitPhoto(
  accessToken: string,
  visitId: string,
  input: {
    uri: string;
    type: string;
    clientGeneratedId: string;
    capturedAt: string;
    gpsLatitude?: number | null;
    gpsLongitude?: number | null;
  }
) {
  const formData = new FormData();
  formData.append("type", input.type);
  formData.append("clientGeneratedId", input.clientGeneratedId);
  formData.append("capturedAt", input.capturedAt);

  if (input.gpsLatitude != null) {
    formData.append("gpsLatitude", String(input.gpsLatitude));
  }

  if (input.gpsLongitude != null) {
    formData.append("gpsLongitude", String(input.gpsLongitude));
  }

  formData.append("file", {
    uri: input.uri,
    name: `${input.type}-${input.clientGeneratedId}.jpg`,
    type: "image/jpeg"
  } as unknown as Blob);

  const response = await fetch(`${API_BASE_URL}/visits/${visitId}/photos`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
    body: formData
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json() as Promise<{ data: { id: string; url: string } }>;
}
