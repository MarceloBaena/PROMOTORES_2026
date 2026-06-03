'use client';

import Link from 'next/link';
import { useCallback, useDeferredValue, useEffect, useState } from 'react';
import { ErrorState, LoadingState, PaginationControls } from '@/components/page-states';
import { DataTable } from '@/components/ui/data-table';
import { FilterBar } from '@/components/ui/filter-bar';
import { PageContainer } from '@/components/ui/layout-primitives';
import { FormField } from '@/components/ui/form-field';
import { NoticeCard } from '@/components/ui/notice-card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { StatsCard } from '@/components/ui/stats-card';
import { ApiError, getSyncPendencies } from '@/lib/api';
import { formatDateTime, formatDistance, formatStatusLabel, statusBadgeClassName } from '@/lib/format';
import type { SyncPendenciesListResponse } from '@/lib/types';

export default function SyncPendenciesPage() {
  const [data, setData] = useState<SyncPendenciesListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const deferredSearch = useDeferredValue(search);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(
        await getSyncPendencies({
          date,
          page,
          pageSize: 20,
          status: status || undefined,
          search: deferredSearch || undefined,
        }),
      );
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : 'Falha ao carregar pendencias de sincronizacao',
      );
    } finally {
      setLoading(false);
    }
  }, [date, deferredSearch, page, status]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return <LoadingState message="Carregando pendencias de sincronizacao..." />;
  }

  if (!data || error) {
    return (
      <ErrorState
        message={error ?? 'Falha ao carregar pendencias de sincronizacao'}
        onRetry={() => void loadData()}
      />
    );
  }

  const itemsInProgress = data.items.filter((item) => item.status === 'IN_PROGRESS').length;
  const itemsSyncPending = data.items.filter((item) => item.status === 'SYNC_PENDING').length;
  const itemsOutsideGeofence = data.items.filter((item) => item.outsideGeofence).length;
  const itemsWithoutMinimumEvidence = data.items.filter(
    (item) => item.beforePhotosCount === 0 || item.afterPhotosCount === 0 || !item.checklistSubmitted,
  ).length;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Pendencias de sync"
        title="Visitas em andamento ou aguardando consolidacao"
        description="Leitura operacional de itens que ainda nao fecharam a trilha de atendimento ou permanecem na fila de sincronizacao."
      />

      <section className="stats-grid">
        <StatsCard label="Pendencias na pagina" value={data.items.length} />
        <StatsCard label="Em andamento" value={itemsInProgress} tone="warning" />
        <StatsCard label="Aguardando sync" value={itemsSyncPending} tone="danger" />
        <StatsCard label="Fora de area" value={itemsOutsideGeofence} />
        <StatsCard label="Evidencia incompleta" value={itemsWithoutMinimumEvidence} tone="danger" />
      </section>

      <SectionCard
        title="Backlog operacional"
        description="Combine data, status e busca livre para localizar rapidamente clientes ou promotores com fila pendente."
      >
        <FilterBar>
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

          <FormField label="Status">
            <select
              className="select"
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
            >
              <option value="">Todos</option>
              <option value="IN_PROGRESS">Em andamento</option>
              <option value="SYNC_PENDING">Aguardando sync</option>
            </select>
          </FormField>

          <FormField label="Buscar">
            <input
              className="input"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="Cliente ou promotor"
            />
          </FormField>
        </FilterBar>

        <NoticeCard
          title="Leitura da fila"
          description="Itens em andamento indicam visita aberta sem fechamento. Itens em sync pendente indicam visita concluida localmente e aguardando consolidacao com o backend."
        />

        <DataTable
          columns={[
            {
              key: 'customer',
              header: 'Cliente',
              render: (item) => (
                <>
                  <strong>{item.customerName}</strong>
                  <div className="hint">
                    Sequencia {item.sequence} - {item.promoterName}
                  </div>
                </>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (item) => (
                <>
                  <span className={statusBadgeClassName(item.status)}>{formatStatusLabel(item.status)}</span>
                  <div className="hint">{item.pendingReason}</div>
                </>
              ),
            },
            {
              key: 'timeline',
              header: 'Check-in / Check-out',
              render: (item) => (
                <>
                  <div>{formatDateTime(item.checkInAt)}</div>
                  <div className="hint">{formatDateTime(item.checkOutAt)}</div>
                </>
              ),
            },
            {
              key: 'geofence',
              header: 'Geofence',
              render: (item) => (
                <>
                  <div>{formatDistance(item.geofenceDistanceM)}</div>
                  <div className="hint">
                    {item.outsideGeofence ? 'Fora da area' : 'Dentro da area'}
                  </div>
                </>
              ),
            },
            {
              key: 'evidence',
              header: 'Evidencias',
              render: (item) => (
                <div className="mono">
                  antes {item.beforePhotosCount} - depois {item.afterPhotosCount}
                  <div className="hint">
                    checklist {item.checklistSubmitted ? 'ok' : 'pendente'} - alertas {item.openAlerts}
                  </div>
                </div>
              ),
            },
            {
              key: 'actions',
              header: '',
              render: (item) =>
                item.visitId ? (
                  <Link className="button button-secondary" href={`/dashboard/visits/${item.visitId}`}>
                    Abrir visita
                  </Link>
                ) : (
                  <span className="hint">Sem visita remota</span>
                ),
            },
          ]}
          emptyTitle="Nenhuma pendencia encontrada"
          emptyDescription="Nao ha backlog operacional para os filtros aplicados."
          getRowKey={(item) => item.routeStopId}
          items={data.items}
          mobileTitle={(item) => item.customerName}
          mobileSubtitle={(item) => item.promoterName}
          mobileMeta={(item) => (
            <span className={statusBadgeClassName(item.status)}>{formatStatusLabel(item.status)}</span>
          )}
          mobileBody={(item) => (
            <div className="stack">
              <p className="hint">{item.pendingReason}</p>
              <p className="hint">
                Check-in {formatDateTime(item.checkInAt)} - Check-out {formatDateTime(item.checkOutAt)}
              </p>
              <p className="hint">
                {formatDistance(item.geofenceDistanceM)} -{' '}
                {item.outsideGeofence ? 'Fora da area' : 'Dentro da area'}
              </p>
              <p className="hint">
                Antes {item.beforePhotosCount} - Depois {item.afterPhotosCount} - Checklist{' '}
                {item.checklistSubmitted ? 'ok' : 'pendente'}
              </p>
              {item.notes ? <p className="hint">{item.notes}</p> : null}
            </div>
          )}
          mobileActions={(item) =>
            item.visitId ? (
              <Link className="button button-secondary" href={`/dashboard/visits/${item.visitId}`}>
                Abrir visita
              </Link>
            ) : undefined
          }
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
