'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorState, LoadingState } from '@/components/page-states';
import { DataTable } from '@/components/ui/data-table';
import { FilterBar } from '@/components/ui/filter-bar';
import { FormField } from '@/components/ui/form-field';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { StatsCard } from '@/components/ui/stats-card';
import { ApiError, getReports } from '@/lib/api';
import { formatDateTime, formatPercent } from '@/lib/format';
import type { ReportsResponse } from '@/lib/types';

export default function ReportsPage() {
  const [data, setData] = useState<ReportsResponse | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(await getReports({ date }));
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : 'Falha ao carregar relatorios');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return <LoadingState message="Carregando relatorios..." />;
  }

  if (!data || error) {
    return (
      <ErrorState
        message={error ?? 'Falha ao carregar relatorios'}
        onRetry={() => void loadData()}
      />
    );
  }

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Relatorios"
        title="Previsto x realizado, produtividade e qualidade de evidencia"
        description="Consolide a operacao do dia para identificar produtividade, clientes nao atendidos e check-in fora de area."
      />

      <SectionCard title="Filtro da competencia" description="Analise consolidada por data operacional.">
        <FilterBar>
          <FormField label="Data">
            <input
              className="input"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </FormField>
        </FilterBar>

        <section className="stats-grid">
          <StatsCard label="Previstas" value={data.summary.planned} />
          <StatsCard label="Concluidas" value={data.summary.completed} tone="success" />
          <StatsCard label="Parciais" value={data.summary.partial} tone="warning" />
          <StatsCard label="Nao atendidos" value={data.summary.notDone} tone="danger" />
          <StatsCard label="Fora de area" value={data.summary.outsideGeofenceCheckIns} />
          <StatsCard
            label="Evidencia completa"
            value={formatPercent(data.summary.evidenceCompletionRate)}
          />
        </section>
      </SectionCard>

      <section className="split-grid split-grid-wide">
        <SectionCard
          title="Produtividade por promotor"
          description="Visitas previstas, concluidas e taxa de execucao."
        >
          <DataTable
            columns={[
              {
                key: 'promoter',
                header: 'Promotor',
                render: (item) => item.promoterName,
              },
              { key: 'planned', header: 'Previstas', render: (item) => item.planned },
              { key: 'completed', header: 'Concluidas', render: (item) => item.completed },
              { key: 'partial', header: 'Parciais', render: (item) => item.partial },
              { key: 'notDone', header: 'Nao atendidas', render: (item) => item.notDone },
              {
                key: 'execution',
                header: 'Execucao',
                render: (item) => formatPercent(item.executionRate),
              },
            ]}
            emptyTitle="Sem produtividade consolidada"
            emptyDescription="Nao ha registros para a data selecionada."
            getRowKey={(item) => item.promoterId}
            items={data.promoterProductivity}
            mobileTitle={(item) => item.promoterName}
            mobileMeta={(item) => (
              <span className="badge badge-in-progress">{formatPercent(item.executionRate)}</span>
            )}
            mobileBody={(item) => (
              <div className="stack">
                <p className="hint">Previstas: {item.planned}</p>
                <p className="hint">Concluidas: {item.completed}</p>
                <p className="hint">Parciais: {item.partial}</p>
                <p className="hint">Nao atendidas: {item.notDone}</p>
              </div>
            )}
          />
        </SectionCard>

        <SectionCard
          title="Clientes nao atendidos"
          description="Pendentes ou marcados como nao realizados."
        >
          <DataTable
            columns={[
              { key: 'customer', header: 'Cliente', render: (item) => item.customerName },
              { key: 'promoter', header: 'Promotor', render: (item) => item.promoterName },
              { key: 'status', header: 'Status', render: (item) => item.status },
              {
                key: 'planned',
                header: 'Planejado',
                render: (item) => formatDateTime(item.plannedStartAt),
              },
            ]}
            emptyTitle="Nenhum cliente nao atendido"
            emptyDescription="A operacao nao registrou pendencias nessa data."
            getRowKey={(item) => item.routeStopId}
            items={data.unattendedCustomers}
            mobileTitle={(item) => item.customerName}
            mobileSubtitle={(item) => item.promoterName}
            mobileMeta={(item) => <span className="badge badge-alert">{item.status}</span>}
            mobileBody={(item) => (
              <p className="hint">Planejado para {formatDateTime(item.plannedStartAt)}</p>
            )}
          />
        </SectionCard>
      </section>

      <SectionCard
        title="Check-in fora de area"
        description="Visitas com distancia relevante em relacao a geofence configurada."
      >
        <DataTable
          columns={[
            { key: 'client', header: 'Cliente', render: (item) => item.clientName },
            { key: 'promoter', header: 'Promotor', render: (item) => item.promoterName },
            {
              key: 'distance',
              header: 'Distancia',
              render: (item) => `${Math.round(item.geofenceDistanceM ?? 0)} m`,
            },
            {
              key: 'checkIn',
              header: 'Check-in',
              render: (item) => formatDateTime(item.checkInAt),
            },
          ]}
          emptyTitle="Nenhum check-in fora de area"
          emptyDescription="Nao houve desvios relevantes da geofence na data selecionada."
          getRowKey={(item) => item.visitId}
          items={data.outsideGeofenceVisits}
          mobileTitle={(item) => item.clientName}
          mobileSubtitle={(item) => item.promoterName}
          mobileMeta={(item) => <span className="badge badge-partial">{Math.round(item.geofenceDistanceM ?? 0)} m</span>}
          mobileBody={(item) => <p className="hint">Check-in em {formatDateTime(item.checkInAt)}</p>}
        />
      </SectionCard>
    </div>
  );
}
