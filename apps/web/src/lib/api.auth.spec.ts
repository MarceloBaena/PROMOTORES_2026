import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRole } from '@promotor/types';

const state = {
  user: null as {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  } | null,
  accessToken: 'expired-access-token' as string | null,
  refreshToken: 'refresh-token' as string | null,
  setSession: vi.fn(),
  clearSession: vi.fn(),
};

vi.mock('./auth-store', () => ({
  useAuthStore: {
    getState: () => state,
  },
}));

import {
  getBrowserApiBasePath,
  getDashboard,
  getOperationalMap,
  login,
  resolveApiBaseUrl,
  resolveAssetUrl,
} from './api';

describe('web auth api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.accessToken = 'expired-access-token';
    state.refreshToken = 'refresh-token';
    global.fetch = vi.fn();
  });

  it('realiza login com email e senha no painel web', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          user: {
            id: 'supervisor-1',
            name: 'Supervisor',
            email: 'supervisor@formula.local',
            role: 'SUPERVISOR',
          },
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        }),
    } as Response);

    const session = await login({
      email: 'supervisor@formula.local',
      password: 'Supervisor@123',
    });

    expect(session.user.role).toBe('SUPERVISOR');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('troca localhost pelo host atual do navegador quando o painel abre pela rede', () => {
    expect(
      resolveApiBaseUrl('http://localhost:3333/api', '192.168.1.11', 'http:'),
    ).toBe('http://192.168.1.11:3333/api');
  });

  it('mantem a configuracao explicita quando a API ja aponta para um host remoto', () => {
    expect(
      resolveApiBaseUrl('http://api.interna.local:3333/api', '192.168.1.11', 'http:'),
    ).toBe('http://api.interna.local:3333/api');
  });

  it('usa proxy same-origin no navegador para evitar dependencia direta da porta da API', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          user: {
            id: 'supervisor-1',
            name: 'Supervisor',
            email: 'supervisor@formula.local',
            role: 'SUPERVISOR',
          },
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        }),
    } as Response);

    await login({
      email: 'supervisor@formula.local',
      password: 'Supervisor@123',
    });

    expect(getBrowserApiBasePath()).toBe('/backend-api');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/backend-api/auth/login');
  });

  it('resolve uploads locais pelo proxy same-origin quando o painel roda no navegador', () => {
    expect(resolveAssetUrl('/uploads/foto.jpg')).toBe(
      `${window.location.origin}/backend-uploads/foto.jpg`,
    );
  });

  it('faz refresh automatico antes de carregar o dashboard quando o access token expira', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: 'Sessao expirada' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            user: {
              id: 'supervisor-1',
              name: 'Supervisor',
              email: 'supervisor@formula.local',
              role: 'SUPERVISOR',
            },
            accessToken: 'new-access-token',
            refreshToken: 'new-refresh-token',
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            activeJourneys: 0,
            plannedVisits: 10,
            completedVisits: 0,
            pendingVisits: 10,
            partialVisits: 0,
            highAlerts: 0,
            mapPoints: [],
            alerts: [],
          }),
      } as Response);

    const dashboard = await getDashboard();

    expect(dashboard.plannedVisits).toBe(10);
    expect(state.setSession).toHaveBeenCalledWith({
      user: {
        id: 'supervisor-1',
        name: 'Supervisor',
        email: 'supervisor@formula.local',
        role: 'SUPERVISOR',
      },
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('coordena refresh compartilhado quando varias consultas falham com 401 ao mesmo tempo', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: 'Sessao expirada' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: 'Sessao expirada' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            user: {
              id: 'supervisor-1',
              name: 'Supervisor',
              email: 'supervisor@formula.local',
              role: 'SUPERVISOR',
            },
            accessToken: 'shared-access-token',
            refreshToken: 'shared-refresh-token',
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            activeJourneys: 0,
            plannedVisits: 10,
            completedVisits: 0,
            pendingVisits: 10,
            partialVisits: 0,
            highAlerts: 0,
            mapPoints: [],
            alerts: [],
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            date: '2026-03-22',
            promoters: [],
            routeCustomers: [],
          }),
      } as Response);

    const [dashboard, map] = await Promise.all([getDashboard(), getOperationalMap()]);

    expect(dashboard.plannedVisits).toBe(10);
    expect(map.promoters).toEqual([]);
    expect(state.setSession).toHaveBeenCalledTimes(1);
    expect(state.clearSession).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(
      vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/auth/refresh')),
    ).toHaveLength(1);
  });
});
