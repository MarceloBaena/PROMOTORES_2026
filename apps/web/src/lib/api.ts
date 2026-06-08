import type { AuthSession } from "@sales-promoters/shared";

const SESSION_KEY = "sales-promoters-session";
const PRODUCTION_API_BASE_URL = "https://promotores-2026-api.vercel.app";
const LOCAL_API_BASE_URL = "http://localhost:3000";

function resolveApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim();

  if (configuredUrl && !configuredUrl.includes("URL-DA-API")) {
    return configuredUrl.replace(/\/$/, "");
  }

  return (import.meta.env.PROD ? PRODUCTION_API_BASE_URL : LOCAL_API_BASE_URL).replace(/\/$/, "");
}

export const API_BASE_URL = resolveApiBaseUrl();

export class ApiConnectionError extends Error {
  constructor() {
    super("Servidor indisponivel. Verifique a conexao com a API.");
  }
}

export class ApiHttpError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function getSession(): AuthSession | null {
  const raw = localStorage.getItem(SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function saveSession(session: AuthSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

async function refreshSession() {
  const session = getSession();

  if (!session?.refreshToken) {
    return null;
  }

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ refreshToken: session.refreshToken })
  }).catch(() => {
    throw new ApiConnectionError();
  });

  if (!response.ok) {
    clearSession();
    return null;
  }

  const next = (await response.json()) as AuthSession;
  saveSession(next);
  return next;
}

async function request(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const session = getSession();
  const headers = new Headers(init.headers);

  if (!headers.has("content-type") && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }

  if (session?.accessToken) {
    headers.set("authorization", `Bearer ${session.accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  }).catch(() => {
    throw new ApiConnectionError();
  });

  if (response.status === 401 && retry) {
    const nextSession = await refreshSession();

    if (nextSession) {
      return request(path, init, false);
    }
  }

  return response;
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await request(path, init);

  if (!response.ok) {
    let message = `Erro HTTP ${response.status}`;
    let code: string | undefined;

    try {
      const body = await response.json();
      message = body.error?.message ?? message;
      code = body.error?.code;
    } catch {
      // Keep fallback message.
    }

    throw new ApiHttpError(response.status, message, code);
  }

  return response.json() as Promise<T>;
}

export async function apiDownload(path: string) {
  const response = await request(path);

  if (!response.ok) {
    throw new ApiHttpError(response.status, `Nao foi possivel baixar ${path}.`);
  }

  return response.blob();
}

export async function login(email: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ email, password })
  }).catch(() => {
    throw new ApiConnectionError();
  });

  if (!response.ok) {
    let message = "Login invalido ou API indisponivel.";
    let code: string | undefined;

    try {
      const body = await response.json();
      message = body.error?.message ?? body.message ?? message;
      code = body.error?.code ?? body.code;
    } catch {
      // Keep fallback message.
    }

    throw new ApiHttpError(response.status, message, code);
  }

  const session = (await response.json()) as AuthSession;
  saveSession(session);
  return session;
}

export async function logout() {
  const session = getSession();

  if (session?.refreshToken) {
    await request("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: session.refreshToken })
    }).catch(() => undefined);
  }

  clearSession();
}

export function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
