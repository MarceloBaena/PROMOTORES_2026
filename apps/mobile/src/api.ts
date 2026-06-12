import * as FileSystem from "expo-file-system/legacy";

declare const process: {
  env?: {
    EXPO_PUBLIC_API_BASE_URL?: string;
  };
};

const PRODUCTION_API_BASE_URL = "https://promotores-2026-api.vercel.app";
const DEFAULT_REQUEST_TIMEOUT_MS = 25000;
const SNAPSHOT_REQUEST_TIMEOUT_MS = 60000;
const UPLOAD_REQUEST_TIMEOUT_MS = 120000;

function resolveApiBaseUrl() {
  const configuredUrl = process.env?.EXPO_PUBLIC_API_BASE_URL?.trim();

  if (configuredUrl && !configuredUrl.includes("URL-DA-API")) {
    return configuredUrl.replace(/\/$/, "");
  }

  return PRODUCTION_API_BASE_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<Response>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Tempo esgotado ao conectar na API apos ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fetch(url, init), timeoutPromise]);
  } catch (error) {
    const technicalMessage = error instanceof Error ? ` Detalhe tecnico: ${error.message}` : "";
    throw new Error(`Nao foi possivel conectar na API. Verifique internet, Wi-Fi/dados moveis e tente novamente.${technicalMessage}`);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

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
  const response = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password })
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json() as Promise<LoginResponse>;
}

export async function testApiConnection() {
  const response = await fetchWithTimeout(`${API_BASE_URL}/health`, {
    method: "GET"
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json() as Promise<{ status: string }>;
}

export async function refreshSession(refreshToken: string): Promise<LoginResponse> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json() as Promise<LoginResponse>;
}

export async function downloadMobileSnapshot(accessToken: string): Promise<MobileSnapshot> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/mobile/snapshot`, {
    headers: { authorization: `Bearer ${accessToken}` }
  }, SNAPSHOT_REQUEST_TIMEOUT_MS);

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
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  }, UPLOAD_REQUEST_TIMEOUT_MS);

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
  const base64Image = await FileSystem.readAsStringAsync(input.uri, {
    encoding: FileSystem.EncodingType.Base64
  });

  return postJson<{ data: { id: string; url: string } }>(
    accessToken,
    `/visits/${visitId}/photos/base64`,
    {
      type: input.type,
      clientGeneratedId: input.clientGeneratedId,
      capturedAt: input.capturedAt,
      gpsLatitude: input.gpsLatitude,
      gpsLongitude: input.gpsLongitude,
      contentType: "image/jpeg",
      base64Image
    }
  );
}
