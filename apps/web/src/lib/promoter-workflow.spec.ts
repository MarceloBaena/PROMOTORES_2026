import { describe, expect, it } from 'vitest';
import {
  buildChecklistDraft,
  getAfterPhotoBlockerMessage,
  getCheckoutRequirements,
  getVisitBlockers,
  isPromoterVisitReadOnly,
} from './promoter-workflow';
import type { PromoterVisitDetailsResponse } from './promoter-types';

describe('promoter workflow', () => {
  it('monta o rascunho do checklist com valores padrao quando a visita ainda nao enviou respostas', () => {
    const draft = buildChecklistDraft([
      {
        code: 'mix',
        label: 'Mix completo exposto',
        type: 'BOOLEAN',
        required: true,
      },
      {
        code: 'ruptura',
        label: 'Observacao de ruptura',
        type: 'TEXT',
        required: false,
      },
    ]);

    expect(draft).toEqual([
      expect.objectContaining({ code: 'mix', value: false }),
      expect.objectContaining({ code: 'ruptura', value: '' }),
    ]);
  });

  it('bloqueia checkout sem evidencias minimas', () => {
    const requirements = getCheckoutRequirements({
      id: 'visit-1',
      routeStopId: 'stop-1',
      journeyId: 'journey-1',
      promoterId: 'promoter-1',
      clientId: 'client-1',
      clientName: 'Cliente Centro',
      status: 'IN_PROGRESS',
      operationalStatus: 'EM_ATENDIMENTO',
      checkInAt: '2026-03-23T08:00:00.000Z',
      outsideGeofence: false,
      checkInPhoto: null,
      beforePhotos: [],
      afterPhotos: [],
      checklist: [],
    });

    expect(requirements).toEqual([
      'foto do estabelecimento',
      'foto do antes',
      'foto do depois',
    ]);
  });

  it('explica os bloqueios da visita quando falta jornada ou evidencia', () => {
    expect(
      getVisitBlockers(
        {
          id: 'stop-1',
          sequence: 1,
          plannedDate: '2026-03-23',
          status: 'PLANNED',
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
        null,
        false,
      ),
    ).toEqual(['Inicie a jornada antes de executar visitas']);
  });

  it('bloqueia a foto de depois ate registrar a foto do antes', () => {
    expect(
      getAfterPhotoBlockerMessage({
        id: 'visit-1',
        routeStopId: 'stop-1',
        journeyId: 'journey-1',
        promoterId: 'promoter-1',
        clientId: 'client-1',
        clientName: 'Cliente Centro',
        status: 'IN_PROGRESS',
        operationalStatus: 'EM_ATENDIMENTO',
        checkInAt: '2026-03-23T08:00:00.000Z',
        outsideGeofence: false,
        checkInPhoto: {
          id: 'photo-checkin-1',
          type: 'BEFORE',
          category: 'CHECKIN_ESTABLISHMENT',
          url: '/uploads/checkin.jpg',
          capturedAt: '2026-03-23T08:02:00.000Z',
        },
        beforePhotos: [],
        afterPhotos: [],
        checklist: [],
      }),
    ).toBe('Tire a foto do antes para continuar.');
  });

  it('libera a foto de depois quando a foto do antes ja existe', () => {
    expect(
      getAfterPhotoBlockerMessage({
        id: 'visit-1',
        routeStopId: 'stop-1',
        journeyId: 'journey-1',
        promoterId: 'promoter-1',
        clientId: 'client-1',
        clientName: 'Cliente Centro',
        status: 'IN_PROGRESS',
        operationalStatus: 'EM_ATENDIMENTO',
        checkInAt: '2026-03-23T08:00:00.000Z',
        outsideGeofence: false,
        checkInPhoto: {
          id: 'photo-checkin-1',
          type: 'BEFORE',
          category: 'CHECKIN_ESTABLISHMENT',
          url: '/uploads/checkin.jpg',
          capturedAt: '2026-03-23T08:02:00.000Z',
        },
        beforePhotos: [
          {
            id: 'photo-before-1',
            type: 'BEFORE',
            category: 'BEFORE_1',
            url: '/uploads/before-1.jpg',
            capturedAt: '2026-03-23T08:10:00.000Z',
          },
        ],
        afterPhotos: [],
        checklist: [],
      }),
    ).toBeNull();
  });

  it('coloca a visita em somente leitura apos o checkout', () => {
    const visit: PromoterVisitDetailsResponse = {
      id: 'visit-1',
      routeStopId: 'stop-1',
      journeyId: 'journey-1',
      promoterId: 'promoter-1',
      clientId: 'client-1',
      clientName: 'Cliente Centro',
      status: 'CHECKED_OUT',
      operationalStatus: 'CONCLUIDA',
      checkInAt: '2026-03-23T08:00:00.000Z',
      checkOutAt: '2026-03-23T09:00:00.000Z',
      outsideGeofence: false,
      checkInPhoto: null,
      beforePhotos: [],
      afterPhotos: [],
      checklist: [],
    };

    expect(isPromoterVisitReadOnly(visit)).toBe(true);
    expect(getAfterPhotoBlockerMessage(visit)).toBe(
      'A visita ja foi finalizada. As fotos de depois ficaram somente leitura.',
    );
  });
});
