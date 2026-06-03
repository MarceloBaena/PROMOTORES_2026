'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { ErrorState, LoadingState } from '@/components/page-states';
import { DataTable } from '@/components/ui/data-table';
import { FilterBar } from '@/components/ui/filter-bar';
import { FormField } from '@/components/ui/form-field';
import { NoticeCard } from '@/components/ui/notice-card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { ApiError, getOperationalMap, getPromoters } from '@/lib/api';
import { formatDateTime, formatPromoterStatusLabel } from '@/lib/format';
import { getRequestErrorMessage, getSettledErrorMessage, getSettledValue } from '@/lib/request-state';
import type { OperationalMapResponse, PromotersListResponse } from '@/lib/types';

const OperationalMap = dynamic(
  () => import('@/components/operational-map').then((module) => module.OperationalMap),
  {
    ssr: false,
  },
);

export default function MapPage() {
  const [data, setData] = useState<OperationalMapResponse | null>(null);
  const [promoters, setPromoters] = useState<PromotersListResponse['items']>([]);
  const [promoterId, setPromoterId] = useState('');
  const [status, setStatus] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSupportMessage(null);

      const [mapResponseResult, promoterResponseResult] = await Promise.allSettled([
        getOperationalMap({
          date,
          promoterId: promoterId || undefined,
          status: status || undefined,
        }),
        getPromoters({ pageSize: 100 }),
      ]);

      const mapResponse = getSettledValue(mapResponseResult);

      if (!mapResponse) {
        throw mapResponseResult.status === 'rejected'
          ? mapResponseResult.reason
          : new ApiError('Falha ao carregar mapa operacional', 500);
      }

      setData(mapResponse);
      setPromoters(getSettledValue(promoterResponseResult)?.items ?? []);

      setSupportMessage(
        getSettledErrorMessage(
          promoterResponseResult,
          'Nao foi possivel carregar a lista de promotores para filtro.',
        ),
      );
    } catch (loadError) {
      setError(getRequestErrorMessage(loadError, 'Falha ao carregar mapa operacional'));
    } finally {
      setLoading(false);
    }
  }, [date, promoterId, status]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return <LoadingState message="Carregando mapa operacional..." />;
  }

  if (!data || error) {
    return (
      <ErrorState
        message={error ?? 'Falha ao carregar mapa operacional'}
        onRetry={() => void loadData()}
      />
    );
  }

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Mapa operacional"
        title="Promotores, clientes do roteiro e status visual da execucao"
        description="Filtre por data, promotor e status para enxergar a operacao em campo com contexto de rota."
      />

      <SectionCard
        title="Visao geografica"
        description="Mapa com promotores em campo e clientes previstos para o roteiro filtrado."
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
              onChange={(event) => setPromoterId(event.target.value)}
            >
              <option value="">Todos</option>
              {promoters.map((promoter) => (
                <option key={promoter.id} value={promoter.id}>
                  {promoter.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Status da visita">
            <select
              className="select"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">Todos</option>
              <option value="PLANNED">Planejada</option>
              <option value="IN_PROGRESS">Em atendimento</option>
              <option value="COMPLETED">Concluida</option>
              <option value="PARTIAL">Parcial</option>
              <option value="NOT_DONE">Nao realizada</option>
            </select>
          </FormField>
        </FilterBar>

        <OperationalMap data={data} />
      </SectionCard>

      <SectionCard
        title="Promotores no mapa"
        description="Ultima atualizacao conhecida, cliente atual e progresso da rota."
      >
        <DataTable
          columns={[
            {
              key: 'promoter',
              header: 'Promotor',
              render: (promoter) => (
                <>
                  <strong>{promoter.promoterName}</strong>
                  <div className="hint">{promoter.promoterEmail}</div>
                </>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (promoter) => formatPromoterStatusLabel(promoter.status),
            },
            {
              key: 'current',
              header: 'Cliente atual',
              render: (promoter) => promoter.currentCustomerName ?? 'Nenhum',
            },
            {
              key: 'next',
              header: 'Proximo cliente',
              render: (promoter) => promoter.nextCustomerName ?? 'Nenhum',
            },
            {
              key: 'completed',
              header: 'Concluidas',
              render: (promoter) => promoter.completedVisits,
            },
            {
              key: 'updated',
              header: 'Atualizado',
              render: (promoter) => formatDateTime(promoter.updatedAt),
            },
          ]}
          emptyTitle="Nenhum promotor no mapa"
          emptyDescription="Nao ha posicoes ou roteiros para os filtros selecionados."
          getRowKey={(promoter) => promoter.promoterId}
          items={data.promoters}
          mobileTitle={(promoter) => promoter.promoterName}
          mobileSubtitle={(promoter) => promoter.promoterEmail}
          mobileMeta={(promoter) => (
            <span className="badge badge-in-progress">
              {formatPromoterStatusLabel(promoter.status)}
            </span>
          )}
          mobileBody={(promoter) => (
            <div className="stack">
              <p className="hint">Atual: {promoter.currentCustomerName ?? 'Nenhum'}</p>
              <p className="hint">Proximo: {promoter.nextCustomerName ?? 'Nenhum'}</p>
              <p className="hint">Concluidas: {promoter.completedVisits}</p>
              <p className="hint">Atualizado em {formatDateTime(promoter.updatedAt)}</p>
            </div>
          )}
        />
      </SectionCard>
    </div>
  );
}
