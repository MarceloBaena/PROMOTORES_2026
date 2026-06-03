'use client';

import Link from 'next/link';
import { useCallback, useDeferredValue, useEffect, useState } from 'react';
import { StatusBadge } from '@/components/status-badge';
import { ErrorState, LoadingState, PaginationControls } from '@/components/page-states';
import { DataTable } from '@/components/ui/data-table';
import { FilterBar } from '@/components/ui/filter-bar';
import { FormField } from '@/components/ui/form-field';
import { NoticeCard } from '@/components/ui/notice-card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { ApiError, getPromoters, getVisits } from '@/lib/api';
import { formatDateTime, formatDistance } from '@/lib/format';
import { getRequestErrorMessage, getSettledErrorMessage, getSettledValue } from '@/lib/request-state';
import type { PromotersListResponse, VisitsListResponse } from '@/lib/types';

export default function VisitsPage() {
  const [data, setData] = useState<VisitsListResponse | null>(null);
  const [promoters, setPromoters] = useState<PromotersListResponse['items']>([]);
  const [page, setPage] = useState(1);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState('');
  const [promoterId, setPromoterId] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const deferredSearch = useDeferredValue(search);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSupportMessage(null);

      const [visitsResponseResult, promotersResponseResult] = await Promise.allSettled([
        getVisits({
          date,
          page,
          pageSize: 20,
          promoterId: promoterId || undefined,
          status: status || undefined,
          search: deferredSearch || undefined,
        }),
        getPromoters({ pageSize: 100 }),
      ]);

      const visitsResponse = getSettledValue(visitsResponseResult);

      if (!visitsResponse) {
        throw visitsResponseResult.status === 'rejected'
          ? visitsResponseResult.reason
          : new ApiError('Falha ao carregar visitas', 500);
      }

      setData(visitsResponse);
      setPromoters(getSettledValue(promotersResponseResult)?.items ?? []);
      setSupportMessage(
        getSettledErrorMessage(
          promotersResponseResult,
          'Nao foi possivel carregar a lista de promotores para filtro.',
        ),
      );
    } catch (loadError) {
      setError(getRequestErrorMessage(loadError, 'Falha ao carregar visitas'));
    } finally {
      setLoading(false);
    }
  }, [date, deferredSearch, page, promoterId, status]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return <LoadingState message="Carregando visitas..." />;
  }

  if (!data || error) {
    return (
      <ErrorState message={error ?? 'Falha ao carregar visitas'} onRetry={() => void loadData()} />
    );
  }

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Visitas"
        title="Visitas do dia"
        description="Filtre por promotor, status e busca para abrir detalhes, geofence, observacoes e evidencias."
      />

      <SectionCard
        title="Operacao detalhada"
        description="Consulta completa com tabela no desktop e leitura compacta no mobile."
      >
        {supportMessage ? (
          <NoticeCard title="Carga parcial" description={supportMessage} />
        ) : null}

        <FilterBar>
          <FormField label="Data">
            <input
              className="input"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </FormField>

          <FormField label="Promotor">
            <select
              className="select"
              value={promoterId}
              onChange={(event) => {
                setPage(1);
                setPromoterId(event.target.value);
              }}
            >
              <option value="">Todos</option>
              {promoters.map((promoter) => (
                <option key={promoter.id} value={promoter.id}>
                  {promoter.name}
                </option>
                ))}
            </select>
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
              <option value="PLANNED">Planejada</option>
              <option value="IN_PROGRESS">Em atendimento</option>
              <option value="COMPLETED">Concluida</option>
              <option value="PARTIAL">Parcial</option>
              <option value="NOT_DONE">Nao realizada</option>
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

        <DataTable
          columns={[
            {
              key: 'client',
              header: 'Cliente',
              render: (visit) => (
                <>
                  <strong>{visit.clientName}</strong>
                  <div className="hint">{visit.notes ?? 'Sem observacoes'}</div>
                </>
              ),
            },
            { key: 'promoter', header: 'Promotor', render: (visit) => visit.promoterName },
            {
              key: 'status',
              header: 'Status',
              render: (visit) => <StatusBadge value={visit.completionStatus ?? visit.status} />,
            },
            {
              key: 'planned',
              header: 'Planejado',
              render: (visit) => formatDateTime(visit.plannedStartAt),
            },
            {
              key: 'check',
              header: 'Check-in / Check-out',
              render: (visit) => (
                <>
                  <div>{formatDateTime(visit.checkInAt)}</div>
                  <div className="hint">{formatDateTime(visit.checkOutAt)}</div>
                </>
              ),
            },
            {
              key: 'geofence',
              header: 'Geofence',
              render: (visit) => (
                <>
                  <div>{formatDistance(visit.geofenceDistanceM)}</div>
                  <div className="hint">
                    {visit.outsideGeofence ? 'Fora da area' : 'Dentro da area'}
                  </div>
                </>
              ),
            },
            {
              key: 'evidence',
              header: 'Evidencias',
              render: (visit) => (
                <div className="mono">
                  antes {visit.beforePhotosCount} - depois {visit.afterPhotosCount}
                  <div className="hint">{visit.alertsOpen} alertas abertos</div>
                </div>
              ),
            },
            {
              key: 'actions',
              header: '',
              render: (visit) =>
                visit.visitId ? (
                  <Link className="button button-secondary" href={`/dashboard/visits/${visit.visitId}`}>
                    Abrir
                  </Link>
                ) : (
                  <span className="hint">Sem check-in</span>
                ),
            },
          ]}
          emptyTitle="Nenhuma visita encontrada"
          emptyDescription="Ajuste os filtros para localizar visitas do periodo."
          getRowKey={(visit) => visit.routeStopId}
          items={data.items}
          mobileTitle={(visit) => visit.clientName}
          mobileSubtitle={(visit) => visit.promoterName}
          mobileMeta={(visit) => <StatusBadge value={visit.completionStatus ?? visit.status} />}
          mobileBody={(visit) => (
            <div className="stack">
              <p className="hint">Planejado: {formatDateTime(visit.plannedStartAt)}</p>
              <p className="hint">
                Check-in {formatDateTime(visit.checkInAt)} - Check-out {formatDateTime(visit.checkOutAt)}
              </p>
              <p className="hint">
                {formatDistance(visit.geofenceDistanceM)} -{' '}
                {visit.outsideGeofence ? 'Fora da area' : 'Dentro da area'}
              </p>
              <p className="hint">
                Antes {visit.beforePhotosCount} - Depois {visit.afterPhotosCount} - Alertas {visit.alertsOpen}
              </p>
              {visit.notes ? <p className="hint">{visit.notes}</p> : null}
            </div>
          )}
          mobileActions={(visit) =>
            visit.visitId ? (
              <Link className="button button-secondary" href={`/dashboard/visits/${visit.visitId}`}>
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
    </div>
  );
}
