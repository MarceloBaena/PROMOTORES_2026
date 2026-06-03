'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, Plus } from 'lucide-react';
import { canManageTeams } from '@promotor/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { FilterBar } from '@/components/ui/filter-bar';
import { FormField } from '@/components/ui/form-field';
import { NoticeCard } from '@/components/ui/notice-card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { ErrorState, LoadingState, PaginationControls } from '@/components/page-states';
import {
  ApiError,
  getCollaborators,
  getTeams,
  updateTeamStatus,
} from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { useHydrated } from '@/lib/use-hydrated';
import type {
  CollaboratorSummary,
  TeamStatus,
  TeamSummary,
  TeamsListResponse,
} from '@/lib/types';
import { getRequestErrorMessage, getSettledErrorMessage, getSettledValue } from '@/lib/request-state';
import { mapSupervisorOption } from '@/features/admin/teams/team-options';

const teamStatusLabels: Record<TeamStatus, string> = {
  ACTIVE: 'Ativa',
  INACTIVE: 'Inativa',
};

const getStatusBadgeClassName = (status: TeamStatus) =>
  status === 'ACTIVE' ? 'badge badge-completed' : 'badge badge-partial';

const initialFilters = {
  name: '',
  code: '',
  supervisorUserId: '',
  region: '',
  status: '',
};

const exportTeamRows = (items: TeamSummary[]) => {
  const rows = [
    ['nome', 'codigo', 'supervisor', 'regiao', 'status', 'promotores', 'atualizado_em'].join(';'),
    ...items.map((item) =>
      [
        item.name,
        item.code,
        item.supervisorName ?? '',
        item.region ?? '',
        teamStatusLabels[item.status],
        String(item.promotersCount),
        new Date(item.updatedAt).toLocaleString('pt-BR'),
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(';'),
    ),
  ];

  const blob = new Blob([rows.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `equipes-promotores-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

export default function TeamsPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const user = useAuthStore((state) => state.user);
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState<TeamsListResponse | null>(null);
  const [supervisors, setSupervisors] = useState<CollaboratorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{
    message: string;
    tone: 'success' | 'warning';
  } | null>(null);
  const [pendingStatusTeam, setPendingStatusTeam] = useState<TeamSummary | null>(null);
  const canManage = user?.role ? canManageTeams(user.role) : false;

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!canManage) {
      router.replace('/dashboard');
    }
  }, [canManage, hydrated, router]);

  const loadData = useCallback(async () => {
    if (!user) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSupportMessage(null);

      const teamsPromise = getTeams({
        page,
        pageSize: 20,
        search: filters.name || undefined,
        code: filters.code || undefined,
        supervisorUserId:
          user.role === 'SUPERVISOR' ? user.id : filters.supervisorUserId || undefined,
        region: filters.region || undefined,
        status: filters.status || undefined,
      });

      if (user.role === 'ADMIN') {
        const [teamsResult, supervisorsResult] = await Promise.allSettled([
          teamsPromise,
          getCollaborators({
            page: 1,
            pageSize: 100,
            role: 'SUPERVISOR',
            status: 'ACTIVE',
          }),
        ]);

        const teams = getSettledValue(teamsResult);

        if (!teams) {
          throw teamsResult.status === 'rejected'
            ? teamsResult.reason
            : new ApiError('Falha ao carregar equipes', 500);
        }

        setData(teams);
        setSupervisors(getSettledValue(supervisorsResult)?.items ?? []);
        setSupportMessage(
          getSettledErrorMessage(
            supervisorsResult,
            'Nao foi possivel carregar a lista de supervisores para filtro.',
          ) ?? null,
        );
      } else {
        setData(await teamsPromise);
        setSupervisors([]);
      }
    } catch (loadError) {
      setError(getRequestErrorMessage(loadError, 'Falha ao carregar equipes.'));
    } finally {
      setLoading(false);
    }
  }, [filters, page, user]);

  useEffect(() => {
    if (!hydrated || !user || !canManage) {
      return;
    }

    void loadData();
  }, [canManage, hydrated, loadData, user]);

  const supervisorOptions = useMemo(() => {
    if (!user) {
      return [];
    }

    if (user.role === 'SUPERVISOR') {
      return [
        {
          id: user.id,
          name: user.name,
          email: user.email,
          employeeCode: '',
          region: '',
        },
      ];
    }

    return supervisors.map(mapSupervisorOption);
  }, [supervisors, user]);

  const nextPendingStatus = pendingStatusTeam?.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

  const handleFilter = () => {
    setPage(1);
    setFilters(draftFilters);
  };

  const handleClearFilters = () => {
    setPage(1);
    setDraftFilters(initialFilters);
    setFilters(initialFilters);
  };

  const handleExport = () => {
    if (!data) {
      return;
    }

    exportTeamRows(data.items);
  };

  const handleToggleStatus = async () => {
    if (!pendingStatusTeam) {
      return;
    }

    try {
      setActionNotice(null);
      await updateTeamStatus(pendingStatusTeam.id, nextPendingStatus);
      setPendingStatusTeam(null);
      setActionNotice({
        message:
          nextPendingStatus === 'ACTIVE'
            ? 'Equipe reativada com sucesso.'
            : 'Equipe inativada com sucesso.',
        tone: 'success',
      });
      await loadData();
    } catch (statusError) {
      setActionNotice({
        message:
          statusError instanceof ApiError
            ? statusError.message
            : 'Falha ao atualizar o status da equipe.',
        tone: 'warning',
      });
    }
  };

  if (!hydrated || !user) {
    return <LoadingState message="Carregando sessao..." />;
  }

  if (!canManage) {
    return <LoadingState message="Redirecionando..." />;
  }

  if (loading) {
    return <LoadingState message="Carregando cadastro de equipes..." />;
  }

  if (!data || error) {
    return <ErrorState message={error ?? 'Falha ao carregar equipes.'} onRetry={() => void loadData()} />;
  }

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Cadastro de equipes"
        title="Equipes de promotores"
        description="Organize supervisor responsavel, regiao e promotores vinculados em um cadastro operacional unico."
        actions={
          <div className="row-actions">
            <button className="button button-secondary" type="button" onClick={handleExport}>
              <Download size={16} />
              Exportar
            </button>
            <Link className="button button-primary" href="/dashboard/teams/new">
              <Plus size={16} />
              Nova equipe
            </Link>
          </div>
        }
      />

      <SectionCard
        title="Listagem de equipes"
        description="Filtre por nome, codigo, supervisor, regiao e status para localizar a equipe certa."
      >
        <FilterBar
          actions={
            <>
              <button className="button button-secondary" type="button" onClick={handleClearFilters}>
                Limpar
              </button>
              <button className="button button-primary" type="button" onClick={handleFilter}>
                Filtrar
              </button>
            </>
          }
        >
          <FormField label="Nome">
            <input
              className="input"
              value={draftFilters.name}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Nome da equipe"
            />
          </FormField>

          <FormField label="Codigo">
            <input
              className="input"
              value={draftFilters.code}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, code: event.target.value }))
              }
              placeholder="Codigo da equipe"
            />
          </FormField>

          <FormField label="Supervisor">
            <select
              className="select"
              value={user.role === 'SUPERVISOR' ? user.id : draftFilters.supervisorUserId}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  supervisorUserId: event.target.value,
                }))
              }
              disabled={user.role === 'SUPERVISOR'}
            >
              <option value="">Todos</option>
              {supervisorOptions.map((supervisor) => (
                <option key={supervisor.id} value={supervisor.id}>
                  {supervisor.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Regiao">
            <input
              className="input"
              value={draftFilters.region}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, region: event.target.value }))
              }
              placeholder="Regiao"
            />
          </FormField>

          <FormField label="Status">
            <select
              className="select"
              value={draftFilters.status}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, status: event.target.value }))
              }
            >
              <option value="">Todos</option>
              <option value="ACTIVE">Ativa</option>
              <option value="INACTIVE">Inativa</option>
            </select>
          </FormField>
        </FilterBar>

        {actionNotice ? <NoticeCard title={actionNotice.message} tone={actionNotice.tone} /> : null}
        {supportMessage ? <NoticeCard title="Carga parcial" description={supportMessage} /> : null}

        <DataTable
          columns={[
            {
              key: 'name',
              header: 'Equipe',
              render: (team) => (
                <>
                  <strong>{team.name}</strong>
                  <div className="hint">{team.code}</div>
                </>
              ),
            },
            {
              key: 'supervisor',
              header: 'Supervisor',
              render: (team) => team.supervisorName ?? 'Sem supervisor',
            },
            {
              key: 'region',
              header: 'Regiao',
              render: (team) => team.region ?? 'Nao informada',
            },
            {
              key: 'count',
              header: 'Promotores',
              render: (team) => team.promotersCount,
            },
            {
              key: 'status',
              header: 'Status',
              render: (team) => (
                <span className={getStatusBadgeClassName(team.status)}>
                  {teamStatusLabels[team.status]}
                </span>
              ),
            },
            {
              key: 'actions',
              header: '',
              render: (team) => (
                <div className="row-actions">
                  <Link className="button button-secondary" href={`/dashboard/teams/${team.id}`}>
                    Detalhes
                  </Link>
                  <Link className="button button-secondary" href={`/dashboard/teams/${team.id}/edit`}>
                    Editar
                  </Link>
                  <button
                    className="button button-danger"
                    type="button"
                    onClick={() => setPendingStatusTeam(team)}
                  >
                    {team.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}
                  </button>
                </div>
              ),
            },
          ]}
          emptyTitle="Nenhuma equipe encontrada"
          emptyDescription="Ajuste os filtros ou cadastre uma nova equipe de promotores."
          getRowKey={(team) => team.id}
          items={data.items}
          mobileTitle={(team) => team.name}
          mobileSubtitle={(team) => team.code}
          mobileMeta={(team) => (
            <span className={getStatusBadgeClassName(team.status)}>{teamStatusLabels[team.status]}</span>
          )}
          mobileBody={(team) => (
            <div className="stack">
              <p className="hint">Supervisor: {team.supervisorName ?? 'Sem supervisor'}</p>
              <p className="hint">Regiao: {team.region ?? 'Nao informada'}</p>
              <p className="hint">Promotores vinculados: {team.promotersCount}</p>
            </div>
          )}
          mobileActions={(team) => (
            <>
              <Link className="button button-secondary" href={`/dashboard/teams/${team.id}`}>
                Detalhes
              </Link>
              <Link className="button button-secondary" href={`/dashboard/teams/${team.id}/edit`}>
                Editar
              </Link>
              <button
                className="button button-danger"
                type="button"
                onClick={() => setPendingStatusTeam(team)}
              >
                {team.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}
              </button>
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
        open={Boolean(pendingStatusTeam)}
        title={pendingStatusTeam?.status === 'ACTIVE' ? 'Inativar equipe' : 'Ativar equipe'}
        description={
          pendingStatusTeam
            ? pendingStatusTeam.status === 'ACTIVE'
              ? `Inativar a equipe ${pendingStatusTeam.name}? Ela deixara de ser elegivel para novos roteiros.`
              : `Reativar a equipe ${pendingStatusTeam.name} para uso operacional?`
            : ''
        }
        confirmLabel={pendingStatusTeam?.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}
        onCancel={() => setPendingStatusTeam(null)}
        onConfirm={() => void handleToggleStatus()}
      />
    </div>
  );
}
