import { format, isValid } from 'date-fns';
import { getVisitStatusLabel } from '@promotor/ui';
import type {
  AlertSeverity,
  AlertType,
  OperationalVisitStatus,
  PromoterOperationalStatus,
  VisitCompletionStatus,
  VisitProgressStatus,
} from '@promotor/types';

const formatKnownDate = (value: string | null | undefined, pattern: string) => {
  if (!value) {
    return 'Nao informado';
  }

  const parsed = new Date(value);
  return isValid(parsed) ? format(parsed, pattern) : 'Nao informado';
};

export const formatDateTime = (value?: string | null) => formatKnownDate(value, 'dd/MM/yyyy HH:mm');

export const formatDate = (value?: string | null) => formatKnownDate(value, 'dd/MM/yyyy');

export const formatPercent = (value?: number | null) => `${Number(value ?? 0).toFixed(1)}%`;

export const formatDistance = (value?: number | null) =>
  value === undefined || value === null ? 'Nao informado' : `${Math.round(value)} m`;

export const formatStatusLabel = (
  value?:
    | VisitProgressStatus
    | VisitCompletionStatus
    | OperationalVisitStatus
    | null,
) => getVisitStatusLabel(value);

export const statusBadgeClassName = (
  value?:
    | VisitProgressStatus
    | VisitCompletionStatus
    | OperationalVisitStatus
    | null,
) => {
  switch (value) {
    case 'COMPLETED':
    case 'CONCLUIDA':
      return 'badge badge-completed';
    case 'IN_PROGRESS':
    case 'PLANNED':
    case 'SYNC_PENDING':
    case 'CHECKED_OUT':
    case 'EM_ATENDIMENTO':
    case 'PENDENTE':
      return 'badge badge-in-progress';
    case 'PARTIAL':
    case 'PARCIAL':
      return 'badge badge-partial';
    case 'NAO_REALIZADA':
    case 'NOT_DONE':
    default:
      return 'badge badge-alert';
  }
};

export const formatPromoterStatusLabel = (
  value?: PromoterOperationalStatus | null,
) => {
  switch (value) {
    case 'ON_ROUTE':
      return 'Em rota';
    case 'DELAYED':
      return 'Atrasado';
    case 'READY':
      return 'Pronto';
    case 'IDLE':
      return 'Sem jornada';
    default:
      return value ?? 'Nao informado';
  }
};

export const promoterStatusBadgeClassName = (
  value?: PromoterOperationalStatus | null,
) => {
  switch (value) {
    case 'ON_ROUTE':
      return 'badge badge-completed';
    case 'READY':
      return 'badge badge-in-progress';
    case 'DELAYED':
      return 'badge badge-partial';
    case 'IDLE':
    default:
      return 'badge badge-alert';
  }
};

export const formatAlertSeverityLabel = (value?: AlertSeverity | null) => {
  switch (value) {
    case 'HIGH':
      return 'Alta';
    case 'MEDIUM':
      return 'Media';
    case 'LOW':
      return 'Baixa';
    default:
      return value ?? 'Nao informado';
  }
};

export const formatAlertTypeLabel = (value?: AlertType | null) => {
  switch (value) {
    case 'GPS_MISSING':
      return 'gps_missing';
    case 'OUTSIDE_GEOFENCE':
      return 'outside_geofence';
    case 'MISSING_REQUIRED_PHOTO':
      return 'missing_required_photo';
    case 'TOO_FAST_VISIT':
      return 'too_fast_visit';
    case 'TOO_LONG_VISIT':
      return 'too_long_visit';
    case 'INCONSISTENT_FINISH':
      return 'inconsistent_finish';
    case 'SYNC_FAILURE':
      return 'sync_failure';
    case 'PENDING_SYNC':
      return 'pending_sync';
    case 'PARTIAL_VISIT':
      return 'partial_visit';
    case 'MISSED_VISIT':
      return 'missed_visit';
    case 'NO_ACTIVE_JOURNEY':
      return 'no_active_journey';
    case 'MISSING_BEFORE_PHOTO':
      return 'missing_before_photo';
    case 'MISSING_AFTER_PHOTO':
      return 'missing_after_photo';
    case 'MISSING_CHECKLIST':
      return 'missing_checklist';
    case 'SKIPPED_CUSTOMER':
      return 'skipped_customer';
    case 'RELEVANT_DELAY':
      return 'relevant_delay';
    default:
      return value ?? 'flag_nao_informada';
  }
};
