import type { AlertSeverity, AlertType } from '@promotor/types';
import type { AlertsListResponse } from '@/lib/types';
import { formatAlertSeverityLabel, formatAlertTypeLabel } from '@/lib/format';

export const AUDIT_ALERT_TYPE_OPTIONS = [
  'GPS_MISSING',
  'OUTSIDE_GEOFENCE',
  'MISSING_REQUIRED_PHOTO',
  'TOO_FAST_VISIT',
  'TOO_LONG_VISIT',
  'INCONSISTENT_FINISH',
  'SYNC_FAILURE',
] as const satisfies readonly AlertType[];

export const buildAlertFiltersSummary = (params: {
  severity: AlertSeverity | '';
  type: AlertType | '';
  resolved: string;
}) => {
  const parts = [
    params.severity ? `Severidade ${formatAlertSeverityLabel(params.severity)}` : null,
    params.type ? `Flag ${formatAlertTypeLabel(params.type)}` : null,
    params.resolved === 'true' ? 'Somente resolvidos' : 'Somente abertos',
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' | ') : 'Sem filtros adicionais';
};

export const getAlertSeverityBadgeValue = (severity: AlertSeverity) =>
  severity === 'HIGH' ? 'NOT_DONE' : 'PARTIAL';

export const buildAlertMobileSubtitle = (
  alert: AlertsListResponse['items'][number],
) => `${alert.promoterName}${alert.clientName ? ` | ${alert.clientName}` : ''}`;
