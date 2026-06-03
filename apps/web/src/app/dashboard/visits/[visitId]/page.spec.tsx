import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VisitDetailPage from './page';

const { getVisitDetailMock } = vi.hoisted(() => ({
  getVisitDetailMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ visitId: 'visit-1' }),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    <div data-alt={String(props.alt ?? '')} data-src={String(props.src ?? '')} />
  ),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');

  return {
    ...actual,
    getVisitDetail: getVisitDetailMock,
    resolveAssetUrl: (value: string) => value,
  };
});

describe('VisitDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVisitDetailMock.mockResolvedValue({
      id: 'visit-1',
      routeDate: '2026-04-13T00:00:00.000Z',
      routeStopId: 'stop-1',
      sequence: 1,
      status: 'COMPLETED',
      completionStatus: 'COMPLETED',
      outsideGeofence: false,
      geofenceDistanceM: 18.4,
      outsideGeofenceJustification: null,
      notes: 'Reposicao concluida com ajuste de frentes e limpeza final.',
      checkInAt: '2026-04-13T12:42:00.000Z',
      checkOutAt: '2026-04-13T13:18:00.000Z',
      promoter: {
        id: 'promoter-1',
        employeeCode: 'PROM-001',
        name: 'Promotor Centro',
        email: 'promotor.centro@formula.local',
      },
      supervisor: {
        id: 'supervisor-1',
        name: 'Supervisor Operacional',
        email: 'supervisor@formula.local',
      },
      client: {
        id: 'customer-1',
        tradeName: 'Supermercado Centro',
        legalName: 'Supermercado Centro LTDA',
        address: 'Rua Um, 120',
        city: 'Cuiaba',
        state: 'MT',
        latitude: -15.6,
        longitude: -56.1,
        geofenceRadiusM: 150,
      },
      photos: [
        {
          id: 'photo-checkin',
          type: 'BEFORE',
          category: 'CHECKIN_ESTABLISHMENT',
          url: '/uploads/checkin.jpg',
          capturedAt: '2026-04-13T12:42:00.000Z',
        },
        {
          id: 'photo-before',
          type: 'BEFORE',
          category: 'BEFORE_1',
          url: '/uploads/before.jpg',
          capturedAt: '2026-04-13T12:45:00.000Z',
        },
        {
          id: 'photo-after',
          type: 'AFTER',
          category: 'AFTER_1',
          url: '/uploads/after.jpg',
          capturedAt: '2026-04-13T13:16:00.000Z',
        },
      ],
      checklist: [],
      statusHistory: [],
      alerts: [
        {
          id: 'alert-1',
          type: 'OUTSIDE_GEOFENCE',
          severity: 'HIGH',
          message: 'Check-in fora da geofence em Supermercado Centro',
          createdAt: '2026-04-13T12:43:00.000Z',
          resolvedAt: null,
          resolutionNote: null,
        },
      ],
      trackPoints: [],
      nextVisit: {
        routeStopId: 'stop-2',
        visitId: 'visit-2',
        customerId: 'customer-2',
        customerName: 'Atacado Leste',
        sequence: 2,
        plannedStartAt: '2026-04-13T13:40:00.000Z',
      },
      auditTrail: [],
    });
  });

  it('renderiza o wireframe de evidencias com resumo, etapas, fotos e acoes finais', async () => {
    render(<VisitDetailPage />);

    await waitFor(() => {
      expect(getVisitDetailMock).toHaveBeenCalledWith('visit-1');
    });

    expect(screen.getByRole('heading', { name: 'Evidencias da visita' })).toBeDefined();
    expect(screen.getByText('Supermercado Centro')).toBeDefined();
    expect(screen.getByText('Promotor Centro')).toBeDefined();
    expect(screen.getAllByRole('link', { name: /Voltar/i })).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Exportar/i })).toBeDefined();

    expect(screen.getByRole('heading', { name: 'Resumo da visita' })).toBeDefined();
    expect(screen.getByText('Supervisor Operacional')).toBeDefined();

    expect(screen.getByRole('heading', { name: 'Etapas da visita' })).toBeDefined();
    expect(screen.getByText('Check-in com foto')).toBeDefined();
    expect(screen.getAllByText('Foto do antes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Foto do depois').length).toBeGreaterThan(0);
    expect(screen.getByText('Atendimento encerrado')).toBeDefined();

    expect(screen.getByRole('heading', { name: 'Evidencias fotograficas' })).toBeDefined();
    expect(screen.getByText('Foto do check-in')).toBeDefined();
    expect(screen.getAllByText('Foto do antes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Foto do depois').length).toBeGreaterThan(0);

    expect(screen.getByRole('heading', { name: 'Observacoes da visita' })).toBeDefined();
    expect(
      screen.getByText('Reposicao concluida com ajuste de frentes e limpeza final.'),
    ).toBeDefined();

    expect(screen.getByRole('heading', { name: 'Flags de auditoria' })).toBeDefined();
    expect(screen.getByText('outside_geofence')).toBeDefined();
    expect(screen.getByText('Check-in fora da geofence em Supermercado Centro')).toBeDefined();

    expect(screen.getByRole('heading', { name: 'Acoes finais' })).toBeDefined();
    expect(screen.getByRole('link', { name: /Ver proxima visita/i })).toBeDefined();
  });
});
