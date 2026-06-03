'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { ArrowRight, RefreshCcw } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/page-states';
import { NoticeCard } from '@/components/ui/notice-card';
import { PageContainer } from '@/components/ui/layout-primitives';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { StatsCard } from '@/components/ui/stats-card';
import { ApiError, getDashboard, getOperationalMap, getTeam } from '@/lib/api';
import { formatDateTime, formatPercent, formatPromoterStatusLabel } from '@/lib/format';
import { getRequestErrorMessage, getSettledErrorMessage, getSettledValue } from '@/lib/request-state';
import type { DashboardResponse, OperationalMapResponse, TeamListResponse } from '@/lib/types';

const OperationalMap = dynamic(
  () => import('@/components/operational-map').then((module) => module.OperationalMap),
  {
    ssr: false,
  },
);

const teamStatusClassName = (status: TeamListResponse['items'][number]['status']) => {
  switch (status) {
    case 'ON_ROUTE':
      return 'badge badge-completed';
    case 'READY':
      return 'badge badge-in-progress';
    case 'DELAYED':
      return 'badge badge-partial';
    default:
      return 'badge badge-alert';
  }
};

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [mapData, setMapData] = useState<OperationalMapResponse | null>(null);
  const [team, setTeam] = useState<TeamListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      setSupportMessage(null);

      const [dashboardResult, mapResult, teamResult] = await Promise.allSettled([
        getDashboard(),
        getOperationalMap(),
        getTeam({ pageSize: 4 }),
      ]);

      const dashboardResponse = getSettledValue(dashboardResult);

      if (!dashboardResponse) {
        throw dashboardResult.status === 'rejected'
          ? dashboardResult.reason
          : new ApiError('Falha ao carregar dashboard', 500);
      }

      setDashboard(dashboardResponse);
      setMapData(
        getSettledValue(mapResult) ?? {
          date: new Date().toISOString(),
          promoters: [],
          routeCustomers: [],
        },
      );
      setTeam(
        getSettledValue(teamResult) ?? {
          page: 1,
          pageSize: 4,
          total: 0,
          items: [],
        },
      );

      const supportErrors = [
        getSettledErrorMessage(mapResult, 'Mapa operacional indisponivel nesta carga.'),
        getSettledErrorMessage(teamResult, 'Resumo da equipe indisponivel nesta carga.'),
      ].filter(Boolean);

      setSupportMessage(supportErrors.length > 0 ? supportErrors.join(' ') : null);
    } catch (loadError) {
      setError(getRequestErrorMessage(loadError, 'Falha ao carregar dashboard'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  if (loading) {
    return <LoadingState message="Carregando visao operacional..." />;
  }

  if (!dashboard || !mapData || !team || error) {
    return (
      <ErrorState
        message={error ?? 'Falha ao carregar o dashboard'}
        onRetry={() => void loadDashboard()}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Dashboard"
        title="Supervisao do dia com leitura rapida e acao imediata"
        description="KPIs, mapa operacional, equipe em rota, alertas abertos e atalhos para clientes, evidencias e roteiros em uma mesma visao."
        meta={
          <div className="page-header-inline-metrics">
            <span className="info-chip info-chip-strong">
              {dashboard.promotersOnRoute} promotores em campo
            </span>
            <span className="info-chip">{dashboard.plannedVisits} visitas planejadas</span>
            <span className="info-chip">
              Atualizado com dados do mapa e equipe do dia
            </span>
          </div>
        }
        actions={
          <button className="button button-secondary" type="button" onClick={() => void loadDashboard()}>
            <RefreshCcw size={16} />
            Atualizar painel
          </button>
        }
      />

      {supportMessage ? (
        <NoticeCard title="Carga parcial" description={supportMessage} />
      ) : null}

      <section className="stats-grid">
        <StatsCard label="Promotores em rota" value={dashboard.promotersOnRoute} />
        <StatsCard label="Visitas planejadas" value={dashboard.plannedVisits} />
        <StatsCard label="Visitas concluidas" value={dashboard.completedVisits} tone="success" />
        <StatsCard label="Visitas atrasadas" value={dashboard.lateVisits} tone="warning" />
        <StatsCard label="Alertas abertos" value={dashboard.openAlerts} tone="danger" />
        <StatsCard label="Execucao" value={formatPercent(dashboard.executionRate)} />
      </section>

      <section className="split-grid">
        <SectionCard
          title="Mapa operacional"
          description="Ultima posicao valida do promotor e clientes do roteiro do dia."
        >
          <OperationalMap data={mapData} />
        </SectionCard>

        <SectionCard
          title="Equipe em destaque"
          description="Quem esta em rota, atrasado ou sem jornada ativa."
          actions={
            <Link href="/dashboard/team" className="button button-secondary">
              Ver equipe
            </Link>
          }
        >
          <div className="stack">
            {team.items.length === 0 ? (
              <EmptyState
                title="Equipe indisponivel"
                description="Nenhum promotor foi retornado para o resumo do dia."
              />
            ) : (
              team.items.map((member) => (
                <article key={member.promoterId} className="list-card dashboard-list-card">
                  <div className="list-card-header">
                    <span className={teamStatusClassName(member.status)}>
                      {formatPromoterStatusLabel(member.status)}
                    </span>
                    <span className="hint">{member.openAlerts} alertas</span>
                  </div>
                  <strong>{member.promoterName}</strong>
                  <p className="hint">
                    Atual: {member.currentCustomerName ?? 'Nenhum'} - Proximo:{' '}
                    {member.nextCustomerName ?? 'Nenhum'}
                  </p>
                </article>
              ))
            )}
          </div>
        </SectionCard>
      </section>

      <section className="split-grid">
        <SectionCard
          title="Alertas recentes"
          description="Priorize as excecoes que exigem intervencao do supervisor."
          actions={
            <Link href="/dashboard/alerts" className="button button-secondary">
              Ver todos
            </Link>
          }
        >
          <div className="stack">
            {dashboard.alerts.length === 0 ? (
              <EmptyState
                title="Nenhum alerta registrado"
                description="Nao ha alertas ativos para a data consultada."
              />
            ) : (
              dashboard.alerts.slice(0, 4).map((alert) => (
                <article key={alert.id} className="list-card dashboard-list-card">
                  <div className="list-card-header">
                    <StatusBadge value={alert.severity === 'HIGH' ? 'NOT_DONE' : 'PARTIAL'} />
                    <span className="hint">{formatDateTime(alert.createdAt)}</span>
                  </div>
                  <strong>{alert.message}</strong>
                  <p className="hint">
                    {alert.promoterName}
                    {alert.clientName ? ` - ${alert.clientName}` : ''}
                  </p>
                </article>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Atalhos do painel"
          description="Acesse os modulos mais usados no acompanhamento do dia."
        >
          <div className="dashboard-shortcut-grid">
            {[
              [
                'Visitas do dia',
                '/dashboard/visits',
                'Consultar check-in, check-out, observacoes e evidencias.',
              ],
              [
                'Evidencias',
                '/dashboard/evidences',
                'Comparar fotos antes e depois por cliente, promotor e data.',
              ],
              [
                'Clientes',
                '/dashboard/customers',
                'Cadastrar clientes, agenda operacional e geofence.',
              ],
              [
                'Roteiros',
                '/dashboard/route-plans',
                'Montar e revisar o roteiro diario por promotor.',
              ],
              [
                'Relatorios',
                '/dashboard/reports',
                'Consolidar produtividade, fora de area e taxa de evidencia.',
              ],
              [
                'Pendencias de sync',
                '/dashboard/sync-pendencies',
                'Ver visitas em andamento, backlog de consolidacao e risco de fila.',
              ],
              [
                'Auditoria',
                '/dashboard/audit',
                'Consultar trilha de alteracoes operacionais e administrativas.',
              ],
              [
                'Arquitetura',
                '/dashboard/architecture',
                'Consultar blueprint, banco, APIs, sincronizacao e wireframes da solucao.',
              ],
            ].map(([label, href, description]) => (
              <Link key={href} href={href} className="list-card dashboard-shortcut-card">
                <div className="dashboard-shortcut-copy">
                  <strong>{label}</strong>
                  <p className="hint">{description}</p>
                </div>
                <span className="mono dashboard-shortcut-action">
                  Abrir modulo <ArrowRight size={14} />
                </span>
              </Link>
            ))}
          </div>
        </SectionCard>
      </section>
    </PageContainer>
  );
}
