'use client';

import { useCallback, useDeferredValue, useEffect, useState } from 'react';
import { ErrorState, LoadingState, PaginationControls } from '@/components/page-states';
import { DataTable } from '@/components/ui/data-table';
import { FilterBar } from '@/components/ui/filter-bar';
import { FormField } from '@/components/ui/form-field';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { ApiError, getTeam } from '@/lib/api';
import { formatDateTime, formatPromoterStatusLabel } from '@/lib/format';
import type { TeamListResponse } from '@/lib/types';

export default function TeamPage() {
  const [data, setData] = useState<TeamListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const deferredSearch = useDeferredValue(search);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(
        await getTeam({
          date,
          page,
          pageSize: 20,
          search: deferredSearch || undefined,
          status: status || undefined,
        }),
      );
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : 'Falha ao carregar equipe');
    } finally {
      setLoading(false);
    }
  }, [date, deferredSearch, page, status]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return <LoadingState message="Carregando equipe..." />;
  }

  if (!data || error) {
    return (
      <ErrorState message={error ?? 'Falha ao carregar equipe'} onRetry={() => void loadData()} />
    );
  }

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Equipe"
        title="Status operacional da equipe"
        description="Acompanhe inicio de jornada, cliente atual, proximo cliente, atrasos e alertas em uma leitura unica."
      />

      <SectionCard
        title="Quadro da equipe"
        description="Filtros operacionais com leitura desktop e cards compactos no mobile."
      >
        <FilterBar>
          <FormField label="Data">
            <input
              className="input"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </FormField>

          <FormField label="Buscar promotor">
            <input
              className="input"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="Nome ou email"
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
              <option value="ON_ROUTE">Em rota</option>
              <option value="DELAYED">Atrasado</option>
              <option value="READY">Pronto</option>
              <option value="IDLE">Sem jornada</option>
            </select>
          </FormField>
        </FilterBar>

        <DataTable
          columns={[
            {
              key: 'promoter',
              header: 'Promotor',
              render: (item) => (
                <>
                  <strong>{item.promoterName}</strong>
                  <div className="hint">
                    {item.employeeCode} - {item.promoterEmail}
                  </div>
                </>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (item) => formatPromoterStatusLabel(item.status),
            },
            {
              key: 'journey',
              header: 'Jornada',
              render: (item) => formatDateTime(item.journeyStartedAt),
            },
            {
              key: 'current',
              header: 'Cliente atual',
              render: (item) => item.currentCustomerName ?? 'Nenhum',
            },
            {
              key: 'next',
              header: 'Proximo cliente',
              render: (item) => item.nextCustomerName ?? 'Nenhum',
            },
            {
              key: 'progress',
              header: 'Concluidas',
              render: (item) => `${item.visitsCompleted}/${item.totalStops}`,
            },
            {
              key: 'delays',
              header: 'Atrasos',
              render: (item) => item.delays,
            },
            {
              key: 'alerts',
              header: 'Alertas',
              render: (item) => item.openAlerts,
            },
          ]}
          emptyTitle="Nenhum promotor encontrado"
          emptyDescription="Ajuste os filtros para localizar a equipe desejada."
          getRowKey={(item) => item.promoterId}
          items={data.items}
          mobileTitle={(item) => item.promoterName}
          mobileSubtitle={(item) => `${item.employeeCode} - ${item.promoterEmail}`}
          mobileMeta={(item) => (
            <span className="badge badge-in-progress">{formatPromoterStatusLabel(item.status)}</span>
          )}
          mobileBody={(item) => (
            <div className="stack">
              <p className="hint">Jornada: {formatDateTime(item.journeyStartedAt)}</p>
              <p className="hint">Atual: {item.currentCustomerName ?? 'Nenhum'}</p>
              <p className="hint">Proximo: {item.nextCustomerName ?? 'Nenhum'}</p>
              <p className="hint">
                Concluidas {item.visitsCompleted}/{item.totalStops} - atrasos {item.delays} - alertas{' '}
                {item.openAlerts}
              </p>
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
    </div>
  );
}
