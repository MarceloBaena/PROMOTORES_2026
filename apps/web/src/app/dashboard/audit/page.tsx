'use client';

import { useCallback, useDeferredValue, useEffect, useState } from 'react';
import { ErrorState, LoadingState, PaginationControls } from '@/components/page-states';
import { DataTable } from '@/components/ui/data-table';
import { FilterBar } from '@/components/ui/filter-bar';
import { PageContainer } from '@/components/ui/layout-primitives';
import { FormField } from '@/components/ui/form-field';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { StatsCard } from '@/components/ui/stats-card';
import { ApiError, getAuditLogs } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AuditLogListResponse } from '@/lib/types';

const auditEntityOptions = [
  'AUTH',
  'PROMOTER',
  'TEAM',
  'TEAM_MEMBER',
  'CUSTOMER',
  'CUSTOMER_IMPORT_BATCH',
  'ROUTE_PLAN',
  'ROUTE_PLAN_ITEM',
  'JOURNEY',
  'GPS_LOG',
  'VISIT',
  'VISIT_CHECKLIST',
  'PHOTO',
  'ALERT',
] as const;

const summarizePayload = (payload: unknown) => {
  if (!payload) {
    return 'Sem payload complementar';
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload === 'object') {
    const keys = Object.keys(payload as Record<string, unknown>);
    return keys.length > 0 ? `Campos: ${keys.join(', ')}` : 'Objeto sem campos visiveis';
  }

  return String(payload);
};

const getActionBadgeClassName = (action: string) => {
  const normalized = action.toUpperCase();

  if (
    normalized.includes('DELETE') ||
    normalized.includes('FAIL') ||
    normalized.includes('ERROR') ||
    normalized.includes('CANCEL')
  ) {
    return 'badge badge-alert';
  }

  if (
    normalized.includes('PUBLISH') ||
    normalized.includes('UPDATE') ||
    normalized.includes('RESOLVE')
  ) {
    return 'badge badge-partial';
  }

  if (
    normalized.includes('CREATE') ||
    normalized.includes('LOGIN') ||
    normalized.includes('CHECK_IN') ||
    normalized.includes('CHECK_OUT')
  ) {
    return 'badge badge-completed';
  }

  return 'badge badge-in-progress';
};

export default function AuditPage() {
  const [data, setData] = useState<AuditLogListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const deferredAction = useDeferredValue(action);
  const deferredSearch = useDeferredValue(search);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(
        await getAuditLogs({
          date,
          page,
          pageSize: 20,
          entityType: entityType || undefined,
          action: deferredAction || undefined,
          search: deferredSearch || undefined,
        }),
      );
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : 'Falha ao carregar auditoria');
    } finally {
      setLoading(false);
    }
  }, [date, deferredAction, deferredSearch, entityType, page]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return <LoadingState message="Carregando trilha de auditoria..." />;
  }

  if (!data || error) {
    return (
      <ErrorState
        message={error ?? 'Falha ao carregar auditoria'}
        onRetry={() => void loadData()}
      />
    );
  }

  const systemActions = data.items.filter((item) => item.actorName === 'Sistema').length;
  const userActions = data.items.length - systemActions;
  const activeFilters = [
    date ? `Data ${date}` : null,
    entityType ? `Entidade ${entityType}` : null,
    deferredAction ? `Acao ${deferredAction}` : null,
    deferredSearch ? `Busca ativa` : null,
  ].filter(Boolean);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Auditoria"
        title="Rastreabilidade operacional e administrativa"
        description="Consulte alteracoes relevantes por data, entidade, acao executada e ator responsavel."
        meta={
          <div className="page-header-inline-metrics">
            <span className="info-chip info-chip-strong">{data.total} eventos filtrados</span>
            <span className="info-chip">{systemActions} do sistema</span>
            <span className="info-chip">{userActions} acoes humanas</span>
          </div>
        }
        actions={
          <button className="button button-secondary" type="button" onClick={() => void loadData()}>
            Atualizar auditoria
          </button>
        }
      />

      <section className="stats-grid">
        <StatsCard label="Eventos na pagina" value={data.items.length} />
        <StatsCard label="Acoes humanas" value={userActions} />
        <StatsCard label="Acoes do sistema" value={systemActions} />
        <StatsCard label="Total filtrado" value={data.total} />
      </section>

      <SectionCard
        title="Eventos auditaveis"
        description="A trilha cobre auth, clientes, roteiros, visitas, fotos, alertas e demais entidades criticas do sistema."
      >
        <FilterBar
          title="Filtros da trilha"
          description="Refine a leitura por data, entidade, acao e texto livre sem perder a visao operacional do conjunto."
          summary={
            activeFilters.length > 0 ? (
              <div className="filter-pill-row">
                {activeFilters.map((filter) => (
                  <span key={filter} className="info-chip">
                    {filter}
                  </span>
                ))}
              </div>
            ) : (
              <span className="hint">Sem filtros adicionais alem da data corrente.</span>
            )
          }
          actions={
            <>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setPage(1);
                  setDate(new Date().toISOString().slice(0, 10));
                  setEntityType('');
                  setAction('');
                  setSearch('');
                }}
              >
                Limpar filtros
              </button>
              <button className="button button-secondary" type="button" onClick={() => void loadData()}>
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

          <FormField label="Entidade">
            <select
              className="select"
              value={entityType}
              onChange={(event) => {
                setPage(1);
                setEntityType(event.target.value);
              }}
            >
              <option value="">Todas</option>
              {auditEntityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Acao">
            <input
              className="input"
              value={action}
              onChange={(event) => {
                setPage(1);
                setAction(event.target.value);
              }}
              placeholder="Ex.: CREATE, LOGIN, PUBLISH"
            />
          </FormField>

          <FormField label="Buscar">
            <input
              className="input"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="Ator, email ou entityId"
            />
          </FormField>
        </FilterBar>

        <DataTable
          summary={
            <div className="table-summary-block">
              <strong>{data.total} eventos localizados</strong>
              <span className="hint">
                A pagina atual mostra {data.items.length} registros com payload e ator consolidados.
              </span>
            </div>
          }
          columns={[
            {
              key: 'timestamp',
              header: 'Quando',
              render: (item) => formatDateTime(item.createdAt),
            },
            {
              key: 'actor',
              header: 'Ator',
              render: (item) => (
                <>
                  <strong>{item.actorName}</strong>
                  <div className="hint">
                    {item.actorRole ?? 'SISTEMA'}
                    {item.actorEmail ? ` - ${item.actorEmail}` : ''}
                  </div>
                </>
              ),
            },
            {
              key: 'entity',
              header: 'Entidade',
              render: (item) => (
                <div className="stack">
                  <span className="audit-entity-pill">{item.entityType}</span>
                  <div className="hint mono">{item.entityId}</div>
                </div>
              ),
            },
            {
              key: 'action',
              header: 'Acao',
              render: (item) => (
                <span className={getActionBadgeClassName(item.action)}>{item.action}</span>
              ),
            },
            {
              key: 'payload',
              header: 'Payload',
              render: (item) => (
                <div className="stack">
                  <div>{summarizePayload(item.payload)}</div>
                  <details className="audit-payload-details">
                    <summary className="audit-payload-summary">Ver payload completo</summary>
                    <pre className="mono audit-payload">{JSON.stringify(item.payload, null, 2)}</pre>
                  </details>
                </div>
              ),
            },
          ]}
          emptyTitle="Nenhum evento encontrado"
          emptyDescription="Ajuste os filtros para localizar eventos de auditoria."
          getRowKey={(item) => item.id}
          items={data.items}
          mobileTitle={(item) => item.action}
          mobileSubtitle={(item) => `${item.entityType} - ${item.actorName}`}
          mobileMeta={(item) => (
            <span className={getActionBadgeClassName(item.action)}>{item.action}</span>
          )}
          mobileBody={(item) => (
            <div className="stack">
              <p className="hint">{formatDateTime(item.createdAt)}</p>
              <p className="hint mono">{item.entityId}</p>
              <p className="hint">
                {item.actorRole ?? 'SISTEMA'}
                {item.actorEmail ? ` - ${item.actorEmail}` : ''}
              </p>
              <p className="hint">{summarizePayload(item.payload)}</p>
              <details className="audit-payload-details">
                <summary className="audit-payload-summary">Ver payload completo</summary>
                <pre className="mono audit-payload">{JSON.stringify(item.payload, null, 2)}</pre>
              </details>
            </div>
          )}
        />

        <PaginationControls
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={setPage}
        />
      </SectionCard>
    </PageContainer>
  );
}
