import type { ChecklistTemplateItem } from '@promotor/types';
import type {
  PromoterChecklistDraftItem,
  PromoterRouteDayStop,
  PromoterVisitDetailsResponse,
} from './promoter-types';

export const PROMOTER_PHOTO_CATEGORIES = [
  { value: 'CHECKIN_ESTABLISHMENT', label: 'Estabelecimento no check-in' },
  { value: 'BEFORE_1', label: 'Antes 1' },
  { value: 'BEFORE_2', label: 'Antes 2' },
  { value: 'AFTER_1', label: 'Depois 1' },
  { value: 'AFTER_2', label: 'Depois 2' },
  { value: 'GENERAL', label: 'Geral' },
  { value: 'SHELF', label: 'Gondola' },
  { value: 'DISPLAY', label: 'Ponta ou display' },
  { value: 'PRICE_TAG', label: 'Preco' },
  { value: 'STOCK', label: 'Estoque' },
  { value: 'OTHER', label: 'Outro' },
] as const;

export const createWebEventId = (prefix: string) =>
  `web-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const buildChecklistDraft = (
  template: ChecklistTemplateItem[],
  existingItems?: PromoterChecklistDraftItem[] | null,
) => {
  const valuesByCode = new Map((existingItems ?? []).map((item) => [item.code, item]));

  return template.map((item) => {
    const existing = valuesByCode.get(item.code);

    return {
      ...item,
      value:
        existing?.value ??
        (item.type === 'BOOLEAN'
          ? false
          : ''),
    } satisfies PromoterChecklistDraftItem;
  });
};

export const isPromoterVisitReadOnly = (
  visit?: PromoterVisitDetailsResponse | null,
) => Boolean(visit?.checkOutAt);

export const REQUIRED_BEFORE_PHOTOS = 1;

export const getBeforePhotoCount = (visit?: PromoterVisitDetailsResponse | null) =>
  visit?.beforePhotos.length ?? 0;

export const hasCheckInEstablishmentPhoto = (visit?: PromoterVisitDetailsResponse | null) =>
  Boolean(visit?.checkInPhoto);

export const getAfterPhotoBlockerMessage = (
  visit?: PromoterVisitDetailsResponse | null,
) => {
  if (!visit) {
    return 'Realize o check-in antes de enviar as fotos de depois.';
  }

  if (isPromoterVisitReadOnly(visit)) {
    return 'A visita ja foi finalizada. As fotos de depois ficaram somente leitura.';
  }

  if (!hasCheckInEstablishmentPhoto(visit)) {
    return 'Confirme o check-in com a foto do estabelecimento antes de continuar.';
  }

  if (getBeforePhotoCount(visit) < REQUIRED_BEFORE_PHOTOS) {
    return 'Tire a foto do antes para continuar.';
  }

  return null;
};

export const getCheckoutRequirements = (visit?: PromoterVisitDetailsResponse | null) => {
  if (!visit) {
    return ['check-in'];
  }

  const missingRequirements: string[] = [];

  if (!hasCheckInEstablishmentPhoto(visit)) {
    missingRequirements.push('foto do estabelecimento');
  }

  if (getBeforePhotoCount(visit) < REQUIRED_BEFORE_PHOTOS) {
    missingRequirements.push('foto do antes');
  }

  if (visit.afterPhotos.length === 0) {
    missingRequirements.push('foto do depois');
  }

  return missingRequirements;
};

export const getVisitBlockers = (
  stop: PromoterRouteDayStop | null,
  visit: PromoterVisitDetailsResponse | null,
  hasActiveJourney: boolean,
) => {
  if (!stop) {
    return ['Visita nao encontrada'];
  }

  if (!hasActiveJourney) {
    return ['Inicie a jornada antes de executar visitas'];
  }

  if (!visit) {
    return [];
  }

  return getCheckoutRequirements(visit).map((item) => `Registre ${item}`);
};
