import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AlertsPage from './page';

const { getAlertsMock, resolveAlertMock } = vi.hoisted(() => ({
  getAlertsMock: vi.fn(),
  resolveAlertMock: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');

  return {
    ...actual,
    getAlerts: getAlertsMock,
    resolveAlert: resolveAlertMock,
  };
});

describe('AlertsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAlertsMock.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'alert-1',
          type: 'SYNC_FAILURE',
          severity: 'MEDIUM',
          message: 'Falha de sincronizacao (CHECK_OUT) em Mercado Centro: timeout',
          active: true,
          promoterName: 'Promotor Centro',
          clientName: 'Mercado Centro',
          visitId: 'visit-1',
          visitStatus: 'IN_PROGRESS',
          createdAt: '2026-04-25T11:00:00.000Z',
          resolvedAt: null,
          resolutionNote: null,
        },
      ],
    });
    resolveAlertMock.mockResolvedValue({
      id: 'alert-1',
      resolvedAt: '2026-04-25T11:05:00.000Z',
      resolutionNote: 'Supervisor confirmou o reenvio.',
      active: false,
    });
  });

  it('renderiza flags tecnicas e resolve manualmente com nota', async () => {
    render(<AlertsPage />);

    await waitFor(() => {
      expect(getAlertsMock).toHaveBeenCalled();
    });

    expect(screen.getByRole('heading', { name: 'Flags operacionais da rotina em campo' })).toBeDefined();
    expect(screen.getAllByText('sync_failure').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Falha de sincronizacao (CHECK_OUT) em Mercado Centro: timeout')
        .length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Resolver' })[0]!);

    expect(screen.getByText('Resolver flag manualmente')).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText(/Descreva como a ocorrencia/i), {
      target: {
        value: 'Supervisor confirmou o reenvio.',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar resolucao' }));

    await waitFor(() => {
      expect(resolveAlertMock).toHaveBeenCalledWith(
        'alert-1',
        'Supervisor confirmou o reenvio.',
      );
    });
  });
});
