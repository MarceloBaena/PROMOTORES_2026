'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AlertSeverity, AlertType } from '@promotor/types';
import { StatusBadge } from '@/components/status-badge';
import {
  ErrorState,
  LoadingState,
  PaginationControls,
} from '@/components/page-states';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { FilterBar } from '@/components/ui/filter-bar';
import { FormField } from '@/components/ui/form-field';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import {
  AUDIT_ALERT_TYPE_OPTIONS,
  buildAlertFiltersSummary,
  buildAlertMobileSubtitle,
  getAlertSeverityBadgeValue,
} from '@/features/alerts/alert-presenters';
import { ApiError, getAlerts, resolveAlert } from '@/lib/api';
import {
  formatAlertSeverityLabel,
  formatAlertTypeLabel,
  formatDateTime,
} from '@/lib/format';
import type { AlertsListResponse } from '@/lib/types';

export default function AlertsPage() {
  const [data, setData] = useState<AlertsListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState<AlertSeverity | ''>('');
  const [type, setType] = useState<AlertType | ''>('');
  const [resolved, setResolved] = useState('false');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [alertToResolve, setAlertToResolve] = useState<
    AlertsListResponse['items'][number] | null
  >(null);
  const [resolutionNote, setResolutionNote] = useState('');

  const activeFiltersSummary = useMemo(
    () => buildAlertFiltersSummary({ resolved, severity, type }),
    [resolved, severity, type],
  );

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(
        await getAlerts({
          date,
          page,
          pageSize: 20,
          severity: severity || undefined,
          type: type || undefined,
          resolved,
        }),
      );
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : 'Falha ao carregar alertas',
      );
    } finally {
      setLoading(false);
    }
  }, [date, page, resolved, severity, type]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  const openResolveDialog = (
    alert: AlertsListResponse['items'][number],
  ) => {
    setAlertToResolve(alert);
    setResolutionNote(alert.resolutionNote ?? '');
  };

  const handleResolve = async () => {
    if (!alertToResolve) {
      return;
    }

    try {
      setResolvingId(alertToResolve.id);
      await resolveAlert(alertToResolve.id, resolutionNote.trim() || undefined);
      setAlertToResolve(null);
      setResolutionNote('');
      await loadAlerts();
    } catch (resolveError) {
      setError(
        resolveError instanceof ApiError
          ? resolveError.message
          : 'Falha ao resolver alerta',
      );
    } finally {
      setResolvingId(null);
    }
  };

  const resetFilters = () => {
    setPage(1);
    setSeverity('');
    setType('');
    setResolved('false');
  };

  if (loading) {
    return <LoadingState message="Carregando alertas..." />;
  }

  if (!data || error) {
    return (
      <ErrorState
        message={error ?? 'Falha ao carregar alertas'}
        onRetry={() => void loadAlerts()}
      />
    );
  }

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Auditoria automatica"
        title="Flags operacionais da rotina em campo"
        description="Monitore inconsistencias automaticas do backend, acompanhe severidade e resolva excecoes manualmente quando a operacao exigir intervencao."
      />

      <SectionCard
        title="Tratamento de flags"
        description="Fila consolidada com vinculo direto para a visita, leitura rapida da severidade e resolucao assistida."
      >
        <FilterBar
          title="Filtros de auditoria"
          description="Refine por data, severidade, flag tecnica e situacao da tratativa."
          summary={
            <div className="stack stack-tight">
              <strong>{data.total} flags localizadas</strong>
              <span className="hint">{activeFiltersSummary}</span>
            </div>
          }
          actions={
            <>
              <button
                className="button button-secondary"
                type="button"
                onClick={resetFilters}
              >
                Limpar filtros
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => void loadAlerts()}
              >
                Recarregar
              </button>
            </>
          }
        >
          <FormField label="Data">
            <input
              className="input"
              type="date"
              value={date}
              onChange={(event) => {
                setPage(1);
                setDate(event.target.value);
              }}
            />
          </FormField>

          <FormField label="Severidade">
            <select
              className="select"
              value={severity}
              onChange={(event) => {
                setPage(1);
                setSeverity(event.target.value as AlertSeverity | '');
              }}
            >
              <option value="">Todas</option>
              <option value="HIGH">Alta</option>
              <option value="MEDIUM">Media</option>
              <option value="LOW">Baixa</option>
            </select>
          </FormField>

          <FormField label="Flag">
            <select
              className="select"
              value={type}
              onChange={(event) => {
                setPage(1);
                setType(event.target.value as AlertType | '');
              }}
            >
              <option value="">Todas</option>
              {AUDIT_ALERT_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatAlertTypeLabel(option)}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Situacao">
            <select
              className="select"
              value={resolved}
              onChange={(event) => {
                setPage(1);
                setResolved(event.target.value);
              }}
            >
              <option value="false">Abertos</option>
              <option value="true">Resolvidos</option>
            </select>
          </FormField>
        </FilterBar>

        <DataTable
          columns={[
            {
              key: 'flag',
              header: 'Flag',
              render: (alert) => (
                <div className="stack stack-tight">
                  <strong>{formatAlertTypeLabel(alert.type)}</strong>
                  <span className="hint">{alert.message}</span>
                </div>
              ),
            },
            {
              key: 'context',
              header: 'Contexto',
              render: (alert) => (
                <div className="stack stack-tight">
                  <strong>{alert.promoterName}</strong>
                  <span className="hint">
                    {alert.clientName
                      ? `Cliente: ${alert.clientName}`
                      : 'Sem cliente vinculado'}
                  </span>
                  <span className="hint">
                    {alert.visitStatus
                      ? `Visita: ${alert.visitStatus}`
                      : 'Sem visita vinculada'}
                  </span>
                </div>
              ),
            },
            {
              key: 'severity',
              header: 'Severidade',
              render: (alert) => (
                <div className="stack stack-tight">
                  <StatusBadge
                    value={getAlertSeverityBadgeValue(alert.severity)}
                  />
                  <span className="hint">
                    {formatAlertSeverityLabel(alert.severity)}
                  </span>
                </div>
              ),
            },
            {
              key: 'created',
              header: 'Criado em',
              render: (alert) => formatDateTime(alert.createdAt),
            },
            {
              key: 'resolution',
              header: 'Tratativa',
              render: (alert) => (
                <div className="stack stack-tight">
                  <strong>{alert.resolvedAt ? 'Resolvido' : 'Aberto'}</strong>
                  <span className="hint">
                    {alert.resolvedAt
                      ? formatDateTime(alert.resolvedAt)
                      : 'Aguardando acao'}
                  </span>
                  {alert.resolutionNote ? (
                    <span className="hint">{alert.resolutionNote}</span>
                  ) : null}
                </div>
              ),
            },
            {
              key: 'actions',
              header: '',
              render: (alert) => (
                <div className="row-actions">
                  {alert.visitId ? (
                    <Link
                      className="button button-secondary"
                      href={`/dashboard/visits/${alert.visitId}`}
                    >
                      Abrir visita
                    </Link>
                  ) : null}
                  {!alert.resolvedAt ? (
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={resolvingId === alert.id}
                      onClick={() => openResolveDialog(alert)}
                    >
                      {resolvingId === alert.id ? 'Resolvendo...' : 'Resolver'}
                    </button>
                  ) : null}
                </div>
              ),
            },
          ]}
          emptyTitle="Nenhuma flag encontrada"
          emptyDescription="Ajuste os filtros para localizar excecoes automaticas da operacao."
          getRowKey={(alert) => alert.id}
          items={data.items}
          summary={
            <div className="stack stack-tight">
              <strong>{data.total} registros</strong>
              <span className="hint">
                Use a coluna Flag para localizar rapidamente a anomalia automatica.
              </span>
            </div>
          }
          mobileTitle={(alert) => formatAlertTypeLabel(alert.type)}
          mobileSubtitle={buildAlertMobileSubtitle}
          mobileMeta={(alert) => (
            <StatusBadge value={getAlertSeverityBadgeValue(alert.severity)} />
          )}
          mobileBody={(alert) => (
            <div className="stack">
              <p>{alert.message}</p>
              <p className="hint">{formatAlertSeverityLabel(alert.severity)}</p>
              <p className="hint">Criado em {formatDateTime(alert.createdAt)}</p>
              <p className="hint">
                {alert.resolvedAt
                  ? `Resolvido em ${formatDateTime(alert.resolvedAt)}`
                  : 'Aberto'}
              </p>
              {alert.resolutionNote ? (
                <p className="hint">Resolucao: {alert.resolutionNote}</p>
              ) : null}
            </div>
          )}
          mobileActions={(alert) => (
            <>
              {alert.visitId ? (
                <Link
                  className="button button-secondary"
                  href={`/dashboard/visits/${alert.visitId}`}
                >
                  Abrir visita
                </Link>
              ) : null}
              {!alert.resolvedAt ? (
                <button
                  className="button button-primary"
                  type="button"
                  disabled={resolvingId === alert.id}
                  onClick={() => openResolveDialog(alert)}
                >
                  {resolvingId === alert.id ? 'Resolvendo...' : 'Resolver'}
                </button>
              ) : null}
            </>
          )}
        />

        <PaginationControls
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={setPage}
        />
      </SectionCard>

      <ConfirmDialog
        open={Boolean(alertToResolve)}
        title="Resolver flag manualmente"
        confirmLabel={
          resolvingId === alertToResolve?.id
            ? 'Salvando...'
            : 'Confirmar resolucao'
        }
        confirmTone="primary"
        confirmDisabled={resolvingId === alertToResolve?.id}
        cancelDisabled={resolvingId === alertToResolve?.id}
        onCancel={() => {
          if (!resolvingId) {
            setAlertToResolve(null);
            setResolutionNote('');
          }
        }}
        onConfirm={() => void handleResolve()}
        description={
          <div className="stack">
            <p className="hint">
              {alertToResolve
                ? `Registrar tratativa para ${formatAlertTypeLabel(alertToResolve.type)}.`
                : 'Registrar tratativa da flag selecionada.'}
            </p>
            <textarea
              className="textarea"
              rows={4}
              value={resolutionNote}
              onChange={(event) => setResolutionNote(event.target.value)}
              placeholder="Descreva como a ocorrencia foi tratada no campo ou na supervisao."
            />
          </div>
        }
      />
    </div>
  );
}
