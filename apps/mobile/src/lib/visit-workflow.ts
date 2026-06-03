import type { LocalVisitDraft, QueueAction, RouteDayStop } from './types';

export type VisitStepKey =
  | 'checkIn'
  | 'startService'
  | 'beforePhotos'
  | 'execution'
  | 'afterPhotos'
  | 'checkout';

export type VisitActionKey = VisitStepKey | 'journey' | 'complete';

export type VisitFlowAction =
  | 'CHECK_IN'
  | 'START_SERVICE'
  | 'CAPTURE_BEFORE_PHOTO'
  | 'SUBMIT_CHECKLIST'
  | 'CAPTURE_AFTER_PHOTO'
  | 'CHECK_OUT';

export interface VisitStep {
  key: VisitStepKey;
  label: string;
  done: boolean;
  blocked: boolean;
}

export interface VisitProgress {
  completedRequired: number;
  totalRequired: number;
}

export interface VisitNextAction {
  key: VisitActionKey;
  label: string;
  description: string;
}

const VISIT_REQUIREMENTS = {
  checkInRegistered: 'check-in registrado',
  checkInPhoto: 'foto do estabelecimento do check-in',
  serviceStarted: 'inicio do atendimento',
  beforePhoto: 'foto antes',
  executionRegistered: 'execucao registrada',
  afterPhoto: 'foto depois',
} as const;

const hasCheckInRegistered = (visit?: LocalVisitDraft | null) =>
  Boolean(visit?.checkInAt);

const hasCheckInPhoto = (visit?: LocalVisitDraft | null) =>
  Boolean(visit?.checkInPhoto);

const hasCheckInCompleted = (visit?: LocalVisitDraft | null) =>
  hasCheckInRegistered(visit) && hasCheckInPhoto(visit);

const hasServiceStarted = (visit?: LocalVisitDraft | null) =>
  Boolean(visit?.serviceStartedAt);

const hasBeforePhoto = (visit?: LocalVisitDraft | null) =>
  (visit?.beforePhotos.length ?? 0) > 0;

const hasExecutionRegistered = (visit?: LocalVisitDraft | null) =>
  Boolean(visit?.checklistSyncedAt);

const hasAfterPhoto = (visit?: LocalVisitDraft | null) =>
  (visit?.afterPhotos.length ?? 0) > 0;

const hasCheckoutCompleted = (visit?: LocalVisitDraft | null) =>
  Boolean(visit?.checkOutAt);

const getActionRequirements = (
  action: VisitFlowAction,
  visit?: LocalVisitDraft | null,
) => {
  const missingRequirements: string[] = [];
  const isCheckout = action === 'CHECK_OUT';

  if (action === 'CHECK_IN') {
    return missingRequirements;
  }

  if (!hasCheckInRegistered(visit)) {
    missingRequirements.push(VISIT_REQUIREMENTS.checkInRegistered);
    if (!isCheckout) {
      return missingRequirements;
    }
  }

  if (!hasCheckInPhoto(visit)) {
    missingRequirements.push(VISIT_REQUIREMENTS.checkInPhoto);
    if (!isCheckout) {
      return missingRequirements;
    }
  }

  if (action === 'START_SERVICE') {
    return missingRequirements;
  }

  if (!hasServiceStarted(visit)) {
    missingRequirements.push(VISIT_REQUIREMENTS.serviceStarted);
    if (!isCheckout) {
      return missingRequirements;
    }
  }

  if (action === 'CAPTURE_BEFORE_PHOTO') {
    return missingRequirements;
  }

  if (!hasBeforePhoto(visit)) {
    missingRequirements.push(VISIT_REQUIREMENTS.beforePhoto);
    if (!isCheckout) {
      return missingRequirements;
    }
  }

  if (action === 'SUBMIT_CHECKLIST') {
    return missingRequirements;
  }

  if (!hasExecutionRegistered(visit)) {
    missingRequirements.push(VISIT_REQUIREMENTS.executionRegistered);
    if (!isCheckout) {
      return missingRequirements;
    }
  }

  if (action === 'CAPTURE_AFTER_PHOTO') {
    return missingRequirements;
  }

  if (!hasAfterPhoto(visit)) {
    missingRequirements.push(VISIT_REQUIREMENTS.afterPhoto);
  }

  return missingRequirements;
};

export const getStartServiceRequirements = (visit?: LocalVisitDraft | null) =>
  getActionRequirements('START_SERVICE', visit);

export const getBeforePhotoRequirements = (visit?: LocalVisitDraft | null) =>
  getActionRequirements('CAPTURE_BEFORE_PHOTO', visit);

export const getExecutionRequirements = (visit?: LocalVisitDraft | null) =>
  getActionRequirements('SUBMIT_CHECKLIST', visit);

export const getAfterPhotoRequirements = (visit?: LocalVisitDraft | null) =>
  getActionRequirements('CAPTURE_AFTER_PHOTO', visit);

export const getCheckoutRequirements = (visit?: LocalVisitDraft | null) =>
  getActionRequirements('CHECK_OUT', visit);

export const getVisitBlockers = (
  stop: RouteDayStop | null,
  visit: LocalVisitDraft | undefined,
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

  if (hasCheckoutCompleted(visit)) {
    return [];
  }

  return getCheckoutRequirements(visit).map((requirement) => {
    if (
      requirement === VISIT_REQUIREMENTS.checkInRegistered ||
      requirement === VISIT_REQUIREMENTS.checkInPhoto
    ) {
      return 'Confirme o check-in com a foto obrigatoria do estabelecimento';
    }

    if (requirement === VISIT_REQUIREMENTS.serviceStarted) {
      return 'Inicie o atendimento antes de registrar evidencias da execucao';
    }

    if (requirement === VISIT_REQUIREMENTS.beforePhoto) {
      return 'Registre pelo menos uma foto de antes';
    }

    if (requirement === VISIT_REQUIREMENTS.executionRegistered) {
      return 'Registre a execucao da visita antes da foto final';
    }

    return 'Registre pelo menos uma foto de depois';
  });
};

export const getVisitProgress = (visit?: LocalVisitDraft | null): VisitProgress => {
  const requiredSteps = [
    hasCheckInCompleted(visit),
    hasServiceStarted(visit),
    hasBeforePhoto(visit),
    hasExecutionRegistered(visit),
    hasAfterPhoto(visit),
    hasCheckoutCompleted(visit),
  ];

  return {
    completedRequired: requiredSteps.filter(Boolean).length,
    totalRequired: requiredSteps.length,
  };
};

export const getVisitSteps = (
  stop: RouteDayStop | null,
  visit: LocalVisitDraft | undefined,
  hasActiveJourney: boolean,
): VisitStep[] => {
  const checkedIn = hasCheckInCompleted(visit);
  const serviceStarted = hasServiceStarted(visit);
  const beforeDone = hasBeforePhoto(visit);
  const executionDone = hasExecutionRegistered(visit);
  const afterDone = hasAfterPhoto(visit);
  const checkoutDone = hasCheckoutCompleted(visit);

  return [
    {
      key: 'checkIn',
      label: 'Check-in',
      done: checkedIn,
      blocked: !hasActiveJourney || !stop || checkoutDone,
    },
    {
      key: 'startService',
      label: 'Iniciar atendimento',
      done: serviceStarted,
      blocked: !checkedIn || checkoutDone,
    },
    {
      key: 'beforePhotos',
      label: 'Foto antes',
      done: beforeDone,
      blocked: !serviceStarted || checkoutDone,
    },
    {
      key: 'execution',
      label: 'Registrar execucao',
      done: executionDone,
      blocked: !beforeDone || checkoutDone,
    },
    {
      key: 'afterPhotos',
      label: 'Foto depois',
      done: afterDone,
      blocked: !serviceStarted || !beforeDone || !executionDone || checkoutDone,
    },
    {
      key: 'checkout',
      label: 'Encerramento',
      done: checkoutDone,
      blocked: checkoutDone || getCheckoutRequirements(visit).length > 0,
    },
  ];
};

export const getNextVisitAction = (
  stop: RouteDayStop | null,
  visit: LocalVisitDraft | undefined,
  hasActiveJourney: boolean,
): VisitNextAction => {
  if (!stop) {
    return {
      key: 'journey',
      label: 'Voltar ao roteiro',
      description: 'A visita selecionada nao esta mais disponivel no aparelho.',
    };
  }

  if (!hasActiveJourney) {
    return {
      key: 'journey',
      label: 'Iniciar jornada',
      description: 'Sem jornada ativa o check-in fica bloqueado. Inicie a jornada no dashboard.',
    };
  }

  if (!visit?.checkInAt) {
    return {
      key: 'checkIn',
      label: 'Realizar check-in',
      description: 'Confirme a chegada na loja com a foto obrigatoria do estabelecimento.',
    };
  }

  if (!visit.checkInPhoto) {
    return {
      key: 'checkIn',
      label: 'Registrar foto do estabelecimento',
      description: 'A visita so segue depois da foto obrigatoria do estabelecimento no check-in.',
    };
  }

  if (visit.checkOutAt) {
    return {
      key: 'complete',
      label: 'Voltar ao roteiro',
      description: visit.pendingSync
        ? 'Visita concluida no aparelho e aguardando sincronizacao.'
        : 'Visita concluida. Siga para a proxima loja ou consulte o historico local.',
    };
  }

  if (!visit.serviceStartedAt) {
    return {
      key: 'startService',
      label: 'Iniciar atendimento',
      description: 'Registre o inicio do atendimento antes de tirar a foto inicial da execucao.',
    };
  }

  if (visit.beforePhotos.length === 0) {
    return {
      key: 'beforePhotos',
      label: 'Registrar foto antes',
      description: 'Capture a primeira evidencia inicial da execucao antes de atuar na loja.',
    };
  }

  if (!hasExecutionRegistered(visit)) {
    return {
      key: 'execution',
      label: 'Registrar execucao',
      description:
        'Confirme a execucao da loja no checklist antes de registrar a foto final do atendimento.',
    };
  }

  if (visit.afterPhotos.length === 0) {
    return {
      key: 'afterPhotos',
      label: 'Registrar foto depois',
      description:
        'Execucao em andamento. Ao concluir o atendimento, registre a evidencia final da loja.',
    };
  }

  return {
    key: 'checkout',
    label: 'Finalizar visita',
    description: 'Feche a visita agora para atualizar o roteiro e seguir para a proxima parada.',
  };
};

export const hasPendingVisitSync = (
  visit: LocalVisitDraft | undefined,
  queue: QueueAction[],
) => {
  if (!visit) {
    return false;
  }

  const hasQueuedActions = queue.some(
    (action) => 'routeStopId' in action && action.routeStopId === visit.routeStopId,
  );

  const hasUnsyncedPhotos =
    (visit.checkInPhoto?.syncStatus ?? 'SYNCED') !== 'SYNCED' ||
    visit.beforePhotos.some((photo) => photo.syncStatus !== 'SYNCED') ||
    visit.afterPhotos.some((photo) => photo.syncStatus !== 'SYNCED');

  return visit.pendingSync || visit.localOnly || hasQueuedActions || hasUnsyncedPhotos;
};
