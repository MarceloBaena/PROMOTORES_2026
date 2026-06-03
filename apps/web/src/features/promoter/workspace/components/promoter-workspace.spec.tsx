'use client';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PromoterRouteBundleResponse,
  PromoterTodayVisitsResponse,
  PromoterVisitDetailsResponse,
} from '@/lib/promoter-types';
import { PromoterWorkspace } from './promoter-workspace';

const {
  mockPush,
  mockReplace,
  authState,
  getPromoterRouteBundleMock,
  getPromoterTodayVisitsMock,
  getPromoterVisitMock,
  startPromoterJourneyMock,
  endPromoterJourneyMock,
  checkInPromoterVisitWithPhotoMock,
  uploadPromoterPhotoMock,
  checkOutPromoterVisitMock,
  sendPromoterTrackPointMock,
  logoutMock,
  getBrowserCoordinatesMock,
  watchBrowserLocationMock,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  authState: {
    user: {
      id: 'promoter-1',
      email: 'promotor.centro@formula.local',
      name: 'Promotor Centro',
      role: 'PROMOTER',
    },
    clearSession: vi.fn(),
  },
  getPromoterRouteBundleMock: vi.fn(),
  getPromoterTodayVisitsMock: vi.fn(),
  getPromoterVisitMock: vi.fn(),
  startPromoterJourneyMock: vi.fn(),
  endPromoterJourneyMock: vi.fn(),
  checkInPromoterVisitWithPhotoMock: vi.fn(),
  uploadPromoterPhotoMock: vi.fn(),
  checkOutPromoterVisitMock: vi.fn(),
  sendPromoterTrackPointMock: vi.fn(),
  logoutMock: vi.fn(),
  getBrowserCoordinatesMock: vi.fn(),
  watchBrowserLocationMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

vi.mock('@/lib/auth-store', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

vi.mock('@/lib/browser-location', () => ({
  getBrowserCoordinates: getBrowserCoordinatesMock,
  watchBrowserLocation: watchBrowserLocationMock,
}));

vi.mock('@/lib/api', () => {
  class MockApiError extends Error {
    status: number;

    constructor(message: string, status: number, details?: unknown) {
      super(message);
      this.status = status;
      this.cause = details;
    }
  }

  return {
    ApiError: MockApiError,
    getPromoterRouteBundle: getPromoterRouteBundleMock,
    getPromoterTodayVisits: getPromoterTodayVisitsMock,
    getPromoterVisit: getPromoterVisitMock,
    startPromoterJourney: startPromoterJourneyMock,
    endPromoterJourney: endPromoterJourneyMock,
    checkInPromoterVisitWithPhoto: checkInPromoterVisitWithPhotoMock,
    uploadPromoterPhoto: uploadPromoterPhotoMock,
    checkOutPromoterVisit: checkOutPromoterVisitMock,
    sendPromoterTrackPoint: sendPromoterTrackPointMock,
    logout: logoutMock,
    resolveAssetUrl: (value: string) => value,
  };
});

const baseBundle: PromoterRouteBundleResponse = {
  route: {
    id: 'route-1',
    date: '2026-03-31T00:00:00.000Z',
    promoterId: 'promoter-1',
    promoterName: 'Promotor Centro',
    planningView: 'DAILY',
    status: 'PUBLISHED',
    version: 1,
    totalStops: 1,
    completedStops: 0,
    pendingStops: 1,
    partialStops: 0,
    skippedStops: 0,
    nextInstruction: 'Prossiga para Cliente Centro.',
    stops: [
      {
        id: 'stop-1',
        sequence: 1,
        priority: 'NORMAL',
        plannedDate: '2026-03-31T00:00:00.000Z',
        status: 'PLANNED',
        operationalStatus: 'PENDENTE',
        plannedStartAt: '2026-03-31T11:00:00.000Z',
        plannedEndAt: '2026-03-31T11:30:00.000Z',
        notes: 'Verificar ponta de gondola.',
        client: {
          id: 'client-1',
          tradeName: 'Cliente Centro',
          legalName: 'Cliente Centro LTDA',
          address: 'Rua Principal, 100',
          city: 'Cuiaba',
          state: 'MT',
          coordinates: {
            latitude: -15.6,
            longitude: -56.1,
          },
          geofence: {
            latitude: -15.6,
            longitude: -56.1,
            radiusInMeters: 120,
          },
        },
      },
    ],
  },
  checklistTemplate: [],
  activeJourney: {
    id: 'journey-1',
    promoterId: 'promoter-1',
    promoterName: 'Promotor Centro',
    startedAt: '2026-03-31T10:00:00.000Z',
    active: true,
  },
  notifications: [],
};

const visitsWithoutVisit: PromoterTodayVisitsResponse = {
  page: 1,
  pageSize: 100,
  total: 1,
  items: [
    {
      routeStopId: 'stop-1',
      visitId: null,
      routePlanId: 'route-1',
      routePlanStatus: 'PUBLISHED',
      sequence: 1,
      plannedStartAt: '2026-03-31T11:00:00.000Z',
      plannedEndAt: '2026-03-31T11:30:00.000Z',
      status: 'PLANNED',
      operationalStatus: 'PENDENTE',
      completionStatus: null,
      client: {
        id: 'client-1',
        tradeName: 'Cliente Centro',
        city: 'Cuiaba',
        state: 'MT',
      },
      checkInAt: null,
      checkOutAt: null,
      outsideGeofence: false,
      beforePhotosCount: 0,
      afterPhotosCount: 0,
      checklistSubmitted: false,
    },
  ],
};

const visitsWithVisit: PromoterTodayVisitsResponse = {
  ...visitsWithoutVisit,
  items: [
    {
      ...visitsWithoutVisit.items[0],
      visitId: 'visit-1',
      status: 'IN_PROGRESS',
      operationalStatus: 'EM_ATENDIMENTO',
      checkInAt: '2026-03-31T11:05:00.000Z',
    },
  ],
};

const activeVisitDetail: PromoterVisitDetailsResponse = {
  id: 'visit-1',
  routeStopId: 'stop-1',
  journeyId: 'journey-1',
  promoterId: 'promoter-1',
  clientId: 'client-1',
  clientName: 'Cliente Centro',
  status: 'IN_PROGRESS',
  operationalStatus: 'EM_ATENDIMENTO',
  completionStatus: null,
  checkInAt: '2026-03-31T11:05:00.000Z',
  checkOutAt: null,
  outsideGeofence: false,
  geofenceDistanceM: 12,
  outsideGeofenceJustification: null,
  notes: null,
  checkInPhoto: {
    id: 'checkin-1',
    type: 'BEFORE',
    category: 'CHECKIN_ESTABLISHMENT',
    url: '/uploads/checkin-1.jpg',
    capturedAt: '2026-03-31T11:05:00.000Z',
    capturedDate: '2026-03-31',
    capturedTime: '11:05:00',
  },
  beforePhotos: [],
  afterPhotos: [],
  checklist: [],
};

const activeVisitWithoutCheckInPhoto: PromoterVisitDetailsResponse = {
  ...activeVisitDetail,
  checkInPhoto: null,
};

const visitWithBeforePhoto: PromoterVisitDetailsResponse = {
  ...activeVisitDetail,
  beforePhotos: [
    {
      id: 'before-1',
      type: 'BEFORE',
      category: 'BEFORE_1',
      url: '/uploads/before-1.jpg',
      capturedAt: '2026-03-31T11:10:00.000Z',
      capturedDate: '2026-03-31',
      capturedTime: '11:10:00',
    },
  ],
};

const visitWithBeforeAndAfterPhoto: PromoterVisitDetailsResponse = {
  ...visitWithBeforePhoto,
  afterPhotos: [
    {
      id: 'after-1',
      type: 'AFTER',
      category: 'AFTER_1',
      url: '/uploads/after-1.jpg',
      capturedAt: '2026-03-31T11:22:00.000Z',
      capturedDate: '2026-03-31',
      capturedTime: '11:22:00',
    },
  ],
};

describe('PromoterWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    watchBrowserLocationMock.mockReturnValue(() => undefined);
    sendPromoterTrackPointMock.mockResolvedValue(undefined);
    startPromoterJourneyMock.mockResolvedValue(undefined);
    endPromoterJourneyMock.mockResolvedValue(undefined);
    checkOutPromoterVisitMock.mockResolvedValue({
      ...visitWithBeforeAndAfterPhoto,
      checkOutAt: '2026-03-31T11:30:00.000Z',
      status: 'COMPLETED',
      operationalStatus: 'CONCLUIDA',
      completionStatus: 'COMPLETED',
    });
    logoutMock.mockResolvedValue(undefined);
  });

  it('abre a confirmacao do check-in e exige foto do estabelecimento antes de confirmar', async () => {
    getPromoterRouteBundleMock.mockResolvedValue(baseBundle);
    getPromoterTodayVisitsMock.mockResolvedValue(visitsWithVisit);
    getPromoterTodayVisitsMock
      .mockResolvedValueOnce(visitsWithoutVisit)
      .mockResolvedValueOnce(visitsWithVisit);
    getPromoterVisitMock.mockResolvedValue(activeVisitDetail);
    getBrowserCoordinatesMock.mockResolvedValue({
      latitude: -15.6001,
      longitude: -56.1001,
    });
    checkInPromoterVisitWithPhotoMock.mockResolvedValue(activeVisitDetail);

    render(<PromoterWorkspace />);

    await screen.findByRole('button', { name: 'Iniciar atendimento' });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar atendimento' }));

    await screen.findByRole('button', { name: 'Fazer check-in' });
    fireEvent.click(screen.getByRole('button', { name: 'Fazer check-in' }));

    const file = new File(['foto-checkin'], 'estabelecimento.jpg', { type: 'image/jpeg' });
    const checkInCameraInput = screen.getByLabelText(
      'Tirar foto do estabelecimento para o check-in',
    );

    fireEvent.click(checkInCameraInput);
    fireEvent.change(checkInCameraInput, {
      target: {
        files: [file],
      },
    });

    expect(checkInPromoterVisitWithPhotoMock).toHaveBeenCalledTimes(0);

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar foto' }));
    expect(screen.getByText(/Check-in liberado para continuar\./i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar check-in' }));

    await waitFor(() => {
      expect(checkInPromoterVisitWithPhotoMock).toHaveBeenCalledTimes(1);
    });

    expect(getBrowserCoordinatesMock).toHaveBeenCalledTimes(1);
    expect(checkInPromoterVisitWithPhotoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        routeStopId: 'stop-1',
        file,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Check-in realizado com sucesso\./i)).toBeTruthy();
    });
  });

  it('captura e confirma a foto do antes antes de liberar a etapa do depois', async () => {
    getPromoterRouteBundleMock.mockResolvedValue(baseBundle);
    getPromoterTodayVisitsMock.mockResolvedValue(visitsWithVisit);
    let visitLoadCount = 0;
    getPromoterVisitMock.mockImplementation(async () => {
      visitLoadCount += 1;
      return visitLoadCount >= 3 ? visitWithBeforePhoto : activeVisitDetail;
    });
    uploadPromoterPhotoMock.mockResolvedValue({
      id: 'photo-before-1',
      type: 'BEFORE',
      category: 'BEFORE_1',
      url: '/uploads/photo-before-1.jpg',
      capturedAt: '2026-03-31T11:10:00.000Z',
      capturedDate: '2026-03-31',
      capturedTime: '11:10:00',
    });

    render(<PromoterWorkspace />);

    await screen.findByRole('button', { name: 'Iniciar atendimento' });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar atendimento' }));

    const beforeStage = (await screen.findByText('Etapa 2 - Foto do antes')).closest(
      '.workspace-stage-card',
    ) as HTMLElement | null;
    expect(beforeStage).toBeTruthy();
    const file = new File(['foto'], 'antes.jpg', { type: 'image/jpeg' });
    const cameraInput = document.querySelectorAll<HTMLInputElement>(
      'input[type="file"][capture="environment"]',
    )[0] ?? null;
    expect(cameraInput).toBeTruthy();

    fireEvent.click(cameraInput!);
    fireEvent.change(cameraInput!, {
      target: {
        files: [file],
      },
    });

    expect(uploadPromoterPhotoMock).toHaveBeenCalledTimes(0);

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar foto do antes' }));

    await waitFor(() => {
      expect(uploadPromoterPhotoMock).toHaveBeenCalledTimes(1);
    });

    expect(uploadPromoterPhotoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        visitId: 'visit-1',
        type: 'BEFORE',
        category: 'BEFORE_1',
        file,
      }),
    );

    expect(screen.getByText('Foto do antes registrada.')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('Etapa 3 - Foto do depois')).toBeTruthy();
    });
  });

  it('mantem a foto do antes bloqueada enquanto o check-in com foto nao estiver concluido', async () => {
    getPromoterRouteBundleMock.mockResolvedValue(baseBundle);
    getPromoterTodayVisitsMock.mockResolvedValue(visitsWithVisit);
    getPromoterVisitMock.mockResolvedValue(activeVisitWithoutCheckInPhoto);

    render(<PromoterWorkspace />);

    await screen.findByRole('button', { name: 'Iniciar atendimento' });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar atendimento' }));

    await screen.findByText('Etapa 1 - Check-in');

    const beforeStep = screen.getByTestId('visit-stage-before');
    expect(within(beforeStep).getByText('Bloqueada')).toBeTruthy();
    expect(within(beforeStep).getByText('Foto do antes')).toBeTruthy();
    expect(screen.queryByText('Etapa 2 - Foto do antes')).toBeNull();
    expect(uploadPromoterPhotoMock).toHaveBeenCalledTimes(0);
  });

  it('mostra um passo a passo visivel com status das etapas da visita', async () => {
    getPromoterRouteBundleMock.mockResolvedValue(baseBundle);
    getPromoterTodayVisitsMock.mockResolvedValue(visitsWithVisit);
    getPromoterVisitMock.mockResolvedValue(activeVisitDetail);

    render(<PromoterWorkspace />);

    await screen.findByRole('button', { name: 'Iniciar atendimento' });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar atendimento' }));

    await screen.findByText('Etapas');

    const checkInStep = screen.getByTestId('visit-stage-checkin');
    const beforeStep = screen.getByTestId('visit-stage-before');
    const afterStep = screen.getByTestId('visit-stage-after');
    const finishStep = screen.getByTestId('visit-stage-finish');

    expect(within(checkInStep).getByText('Check-in com foto')).toBeTruthy();
    expect(within(checkInStep).getByText('Concluida')).toBeTruthy();
    expect(within(beforeStep).getByText('Foto do antes')).toBeTruthy();
    expect(within(beforeStep).getByText('Em andamento')).toBeTruthy();
    expect(within(afterStep).getByText('Foto do depois')).toBeTruthy();
    expect(within(afterStep).getByText('Bloqueada')).toBeTruthy();
    expect(within(finishStep).getByText('Encerrar atendimento')).toBeTruthy();
    expect(within(finishStep).getByText('Bloqueada')).toBeTruthy();
    expect(screen.getByText('Etapa 2 - Foto do antes')).toBeTruthy();
    expect(screen.queryByText('Etapa 1 - Check-in')).toBeNull();
    expect(screen.queryByText('Etapa 3 - Foto do depois')).toBeNull();
    expect(screen.queryByText('Etapa 4 - Encerrar atendimento')).toBeNull();
  });

  it('mostra mensagem clara quando a camera da foto do antes nao abre', async () => {
    getPromoterRouteBundleMock.mockResolvedValue(baseBundle);
    getPromoterTodayVisitsMock.mockResolvedValue(visitsWithVisit);
    getPromoterVisitMock.mockResolvedValue(activeVisitDetail);

    render(<PromoterWorkspace />);

    await screen.findByRole('button', { name: 'Iniciar atendimento' });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar atendimento' }));

    const beforeStage = (await screen.findByText('Etapa 2 - Foto do antes')).closest(
      '.workspace-stage-card',
    ) as HTMLElement | null;
    expect(beforeStage).toBeTruthy();
    const cameraInput = document.querySelectorAll<HTMLInputElement>(
      'input[type="file"][capture="environment"]',
    )[0] ?? null;
    expect(cameraInput).toBeTruthy();

    fireEvent.click(cameraInput!);
    window.dispatchEvent(new Event('focus'));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Nao foi possivel abrir a camera. Tente novamente ou escolha uma imagem da galeria.',
        ),
      ).toBeTruthy();
    });
  });

  it('habilita o encerramento somente quando o antes e o depois ja foram confirmados', async () => {
    getPromoterRouteBundleMock.mockResolvedValue(baseBundle);
    getPromoterTodayVisitsMock.mockResolvedValue(visitsWithVisit);
    getPromoterVisitMock.mockResolvedValue(visitWithBeforeAndAfterPhoto);

    render(<PromoterWorkspace />);

    await screen.findByRole('button', { name: 'Iniciar atendimento' });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar atendimento' }));

    await screen.findByText('Etapa 4 - Encerrar atendimento');
    expect(
      (screen.getByRole('button', { name: 'Encerrar atendimento' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('captura a foto do depois e encerra o atendimento depois de todas as etapas', async () => {
    getPromoterRouteBundleMock.mockResolvedValue(baseBundle);
    getPromoterTodayVisitsMock.mockResolvedValue(visitsWithVisit);
    let visitLoadCount = 0;
    getPromoterVisitMock.mockImplementation(async () => {
      visitLoadCount += 1;

      if (visitLoadCount >= 3) {
        return visitWithBeforeAndAfterPhoto;
      }

      return visitWithBeforePhoto;
    });
    uploadPromoterPhotoMock.mockResolvedValue({
      id: 'photo-after-1',
      type: 'AFTER',
      category: 'AFTER_1',
      url: '/uploads/photo-after-1.jpg',
      capturedAt: '2026-03-31T11:22:00.000Z',
      capturedDate: '2026-03-31',
      capturedTime: '11:22:00',
    });
    getBrowserCoordinatesMock.mockResolvedValue({
      latitude: -15.6001,
      longitude: -56.1001,
    });

    render(<PromoterWorkspace />);

    await screen.findByRole('button', { name: 'Iniciar atendimento' });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar atendimento' }));

    const afterStage = (await screen.findByText('Etapa 3 - Foto do depois')).closest(
      '.workspace-stage-card',
    ) as HTMLElement | null;
    expect(afterStage).toBeTruthy();
    const file = new File(['foto'], 'depois.jpg', { type: 'image/jpeg' });
    const cameraInput = document.querySelectorAll<HTMLInputElement>(
      'input[type="file"][capture="environment"]',
    )[0] ?? null;
    expect(cameraInput).toBeTruthy();

    fireEvent.click(cameraInput!);
    fireEvent.change(cameraInput!, {
      target: {
        files: [file],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar foto do depois' }));

    await waitFor(() => {
      expect(uploadPromoterPhotoMock).toHaveBeenCalledTimes(1);
    });

    expect(uploadPromoterPhotoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        visitId: 'visit-1',
        type: 'AFTER',
        category: 'AFTER_1',
        file,
      }),
    );

    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Encerrar atendimento' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar atendimento' }));

    await waitFor(() => {
      expect(checkOutPromoterVisitMock).toHaveBeenCalledTimes(1);
    });

    expect(checkOutPromoterVisitMock).toHaveBeenCalledWith(
      'visit-1',
      expect.objectContaining({
        completionStatus: 'COMPLETED',
      }),
    );
  });
});
