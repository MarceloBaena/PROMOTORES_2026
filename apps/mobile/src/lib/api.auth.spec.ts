import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRole } from '@promotor/types';

const state = {
  user: null as
    | {
        id: string;
        name: string;
        email: string;
        role: UserRole;
      }
    | null,
  accessToken: 'expired-access-token' as string | null,
  refreshToken: 'refresh-token' as string | null,
  setSession: vi.fn(),
  clearSession: vi.fn(),
};

vi.mock('../store/auth-store', () => ({
  useAuthStore: {
    getState: () => state,
  },
}));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      hostUri: '192.168.1.11:8081',
    },
    expoGoConfig: {
      debuggerHost: '192.168.1.11:8081',
    },
    linkingUri: 'exp://192.168.1.11:8081',
  },
}));

import {
  fetchRouteBundle,
  fetchTodayVisits,
  login,
  resetApiBaseUrlCacheForTests,
} from './api';

const getHeaderValue = (headers: RequestInit['headers'], key: string) => {
  if (!headers) {
    return null;
  }

  if (headers instanceof Headers) {
    return headers.get(key);
  }

  if (Array.isArray(headers)) {
    const entry = headers.find(([name]) => name === key);
    return entry?.[1] ?? null;
  }

  const value = headers[key];
  return typeof value === 'string' ? value : null;
};

const getRequestUrlString = (requestUrl: RequestInfo | URL | undefined) => {
  if (typeof requestUrl === 'string') {
    return requestUrl;
  }

  if (requestUrl instanceof URL) {
    return requestUrl.toString();
  }

  if (requestUrl instanceof Request) {
    return requestUrl.url;
  }

  return '';
};

describe('mobile auth api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.accessToken = 'expired-access-token';
    state.refreshToken = 'refresh-token';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://192.168.1.11:3333/api';
    resetApiBaseUrlCacheForTests();
    global.fetch = vi.fn();
  });

  it('realiza login com email e senha', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            user: {
              id: 'promoter-1',
              name: 'Promotor Centro',
              email: 'promotor.centro@formula.local',
              role: 'PROMOTER',
            },
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
          }),
        ),
    } as Response);

    const session = await login(
      'promotor.centro@formula.local',
      'Promotor@123',
    );

    expect(session.user.email).toBe('promotor.centro@formula.local');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('faz refresh automatico quando a API devolve 401', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ message: 'Sessao expirada' })),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              user: {
                id: 'promoter-1',
                name: 'Promotor Centro',
                email: 'promotor.centro@formula.local',
                role: 'PROMOTER',
              },
              accessToken: 'new-access-token',
              refreshToken: 'new-refresh-token',
            }),
          ),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              route: null,
              checklistTemplate: [],
              activeJourney: null,
            }),
          ),
      } as Response);

    const bundle = await fetchRouteBundle();

    expect(bundle.route).toBeNull();
    expect(state.setSession).toHaveBeenCalledWith({
      user: {
        id: 'promoter-1',
        name: 'Promotor Centro',
        email: 'promotor.centro@formula.local',
        role: 'PROMOTER',
      },
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('compartilha o refresh quando duas chamadas recebem 401 ao mesmo tempo', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ message: 'Sessao expirada' })),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ message: 'Sessao expirada' })),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              user: {
                id: 'promoter-1',
                name: 'Promotor Centro',
                email: 'promotor.centro@formula.local',
                role: 'PROMOTER',
              },
              accessToken: 'shared-access-token',
              refreshToken: 'shared-refresh-token',
            }),
          ),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              route: null,
              checklistTemplate: [],
              activeJourney: null,
            }),
          ),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              page: 1,
              pageSize: 100,
              total: 0,
              items: [],
            }),
          ),
      } as Response);

    const [routeBundle, todayVisits] = await Promise.all([
      fetchRouteBundle(),
      fetchTodayVisits(),
    ]);
    const refreshCalls = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) =>
        typeof url === 'string' ? url.includes('/auth/refresh') : false,
      );

    expect(routeBundle.route).toBeNull();
    expect(todayVisits.total).toBe(0);
    expect(refreshCalls).toHaveLength(1);
    expect(state.setSession).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('usa fallback de host quando a primeira URL da API falha por rede', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://192.0.2.10:3333/api';
    resetApiBaseUrlCacheForTests();

    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              user: {
                id: 'promoter-1',
                name: 'Promotor Centro',
                email: 'promotor.centro@formula.local',
                role: 'PROMOTER',
              },
              accessToken: 'access-token',
              refreshToken: 'refresh-token',
            }),
          ),
      } as Response);

    const session = await login(
      'promotor.centro@formula.local',
      'Promotor@123',
    );

    expect(session.user.role).toBe('PROMOTER');
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('http://192.0.2.10:3333/api/auth/login'),
      expect.any(Object),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('http://192.168.1.11:3333/api/auth/login'),
      expect.any(Object),
    );
  });

  it('envia cabecalho para pular aviso do localtunnel', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://mighty-cats-write.loca.lt/api';
    resetApiBaseUrlCacheForTests();

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            user: {
              id: 'promoter-1',
              name: 'Promotor Centro',
              email: 'promotor.centro@formula.local',
              role: 'PROMOTER',
            },
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
          }),
        ),
    } as Response);

    await login('promotor.centro@formula.local', 'Promotor@123');

    const firstCall = vi.mocked(fetch).mock.calls[0];

    expect(firstCall).toBeDefined();

    const requestUrl = firstCall?.[0];
    const requestInit = firstCall?.[1];
    const normalizedUrl = getRequestUrlString(requestUrl);

    expect(normalizedUrl).toContain('https://mighty-cats-write.loca.lt/api/auth/login');
    expect(getHeaderValue(requestInit?.headers, 'bypass-tunnel-reminder')).toBe('true');
  });
});
