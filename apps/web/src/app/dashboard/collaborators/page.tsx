'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, UserCog } from 'lucide-react';
import { canManageCollaborators } from '@promotor/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { FilterBar } from '@/components/ui/filter-bar';
import { FormField } from '@/components/ui/form-field';
import { NoticeCard } from '@/components/ui/notice-card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { ErrorState, LoadingState, PaginationControls } from '@/components/page-states';
import { ApiError, getCollaborators, updateCollaboratorStatus } from '@/lib/api';
import { getRequestErrorMessage, getSettledErrorMessage, getSettledValue } from '@/lib/request-state';
import type {
  CollaboratorStatus,
  CollaboratorsListResponse,
  CollaboratorSummary,
} from '@/lib/types';
import { useAuthStore } from '@/lib/auth-store';
import { useHydrated } from '@/lib/use-hydrated';

const statusLabels: Record<CollaboratorStatus, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  TERMINATED: 'Desligado',
};

const getStatusBadgeClassName = (status: CollaboratorStatus) => {
  switch (status) {
    case 'ACTIVE':
      return 'badge badge-completed';
    case 'INACTIVE':
      return 'badge badge-partial';
    default:
      return 'badge badge-alert';
  }
};

export default function CollaboratorsPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const user = useAuthStore((state) => state.user);
  const userRole = user?.role ?? null;
  const canManage = userRole ? canManageCollaborators(userRole) : false;
  const isSupervisorManager = userRole === 'SUPERVISOR';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [region, setRegion] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [data, setData] = useState<CollaboratorsListResponse | null>(null);
  const [supervisors, setSupervisors] = useState<CollaboratorSummary[]>([]);
  const [pendingToggle, setPendingToggle] = useState<CollaboratorSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!canManage) {
      router.replace('/dashboard');
    }
  }, [canManage, hydrated, router]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSupportMessage(null);

      if (isSupervisorManager) {
        const collaborators = await getCollaborators({
          page,
          pageSize: 20,
          search: deferredSearch || undefined,
          status: status || undefined,
          region: region || undefined,
        });

        setData(collaborators);
        setSupervisors([]);
        return;
      }

      const [collaboratorsResult, supervisorOptionsResult] = await Promise.allSettled([
        getCollaborators({
          page,
          pageSize: 20,
          search: deferredSearch || undefined,
          role: role || undefined,
          status: status || undefined,
          region: region || undefined,
          supervisorId: supervisorId || undefined,
        }),
        getCollaborators({
          page: 1,
          pageSize: 100,
          role: 'SUPERVISOR',
          status: 'ACTIVE',
        }),
      ]);

      const collaborators = getSettledValue(collaboratorsResult);

      if (!collaborators) {
        throw collaboratorsResult.status === 'rejected'
          ? collaboratorsResult.reason
          : new ApiError('Falha ao carregar colaboradores', 500);
      }

      setData(collaborators);
      setSupervisors(getSettledValue(supervisorOptionsResult)?.items ?? []);

      const supportErrors = [
        getSettledErrorMessage(
          supervisorOptionsResult,
          'Nao foi possivel carregar a lista de supervisores para filtro.',
        ),
      ].filter(Boolean);

      setSupportMessage(supportErrors.length > 0 ? supportErrors.join(' ') : null);
    } catch (loadError) {
      setError(getRequestErrorMessage(loadError, 'Falha ao carregar colaboradores'));
    } finally {
      setLoading(false);
    }
  }, [deferredSearch, isSupervisorManager, page, region, role, status, supervisorId]);

  useEffect(() => {
    if (!hydrated || !canManage) {
      return;
    }

    void loadData();
  }, [canManage, hydrated, loadData]);

  const pendingToggleStatus = useMemo<CollaboratorStatus | null>(() => {
    if (!pendingToggle) {
      return null;
    }

    return pendingToggle.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  }, [pendingToggle]);

  const handleStatusToggle = async () => {
    if (!pendingToggle || !pendingToggleStatus) {
      return;
    }

    try {
      setActionMessage(null);
      await updateCollaboratorStatus(pendingToggle.id, pendingToggleStatus);
      setActionMessage(
        pendingToggleStatus === 'ACTIVE'
          ? 'Colaborador reativado com sucesso.'
          : 'Colaborador inativado e acesso bloqueado.',
      );
      setPendingToggle(null);
      await loadData();
    } catch (statusError) {
      setActionMessage(
        statusError instanceof ApiError
          ? statusError.message
          : 'Falha ao alterar o status do colaborador',
      );
    }
  };

  if (!hydrated || !user) {
    return <LoadingState message="Carregando sessao..." />;
  }

  if (!canManage) {
    return <LoadingState message="Redirecionando..." />;
  }

  if (loading) {
    return <LoadingState message="Carregando cadastro de colaboradores..." />;
  }

  if (!data || error) {
    return (
      <ErrorState
        message={error ?? 'Falha ao carregar colaboradores'}
        onRetry={() => void loadData()}
      />
    );
  }

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow={isSupervisorManager ? 'Supervisor' : 'Administrador'}
        title={isSupervisorManager ? 'Promotores da sua equipe' : 'Cadastro de colaboradores'}
        description={
          isSupervisorManager
            ? 'Cadastre e acompanhe apenas os promotores vinculados a sua supervisao, com status, jornada padrao e bloqueio de acesso.'
            : 'Gerencie supervisores e promotores com status, supervisor responsavel, regiao, matricula e bloqueio de acesso ao sistema.'
        }
        actions={
          <Link className="button button-primary" href="/dashboard/collaborators/new">
            <Plus size={16} />
            {isSupervisorManager ? 'Novo promotor' : 'Novo colaborador'}
          </Link>
        }
      />

      <SectionCard
        title={isSupervisorManager ? 'Base de promotores' : 'Base de colaboradores'}
        description={
          isSupervisorManager
            ? 'Busca por nome, email, CPF ou matricula dos promotores sob sua responsabilidade.'
            : 'Busca por nome, email, CPF ou matricula, com filtros operacionais e acoes sensiveis controladas.'
        }
      >
        <FilterBar>
          <FormField label="Buscar">
            <div className="field-icon-wrap">
              <Search size={16} className="field-icon" />
              <input
                className="input input-with-icon"
                placeholder="Nome, email, CPF ou matricula"
                value={search}
                onChange={(event) => {
                  setPage(1);
                  setSearch(event.target.value);
                }}
              />
            </div>
          </FormField>

          {!isSupervisorManager ? (
            <FormField label="Cargo">
              <select
                className="select"
                value={role}
                onChange={(event) => {
                  setPage(1);
                  setRole(event.target.value);
                }}
              >
                <option value="">Todos</option>
                <option value="PROMOTER">Promotores</option>
                <option value="SUPERVISOR">Supervisores</option>
              </select>
            </FormField>
          ) : null}

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
              <option value="ACTIVE">Ativos</option>
              <option value="INACTIVE">Inativos</option>
              <option value="TERMINATED">Desligados</option>
            </select>
          </FormField>

          <FormField label="Regiao">
            <input
              className="input"
              placeholder="Ex.: Centro"
              value={region}
              onChange={(event) => {
                setPage(1);
                setRegion(event.target.value);
              }}
            />
          </FormField>

          {!isSupervisorManager ? (
            <FormField label="Supervisor">
              <select
                className="select"
                value={supervisorId}
                onChange={(event) => {
                  setPage(1);
                  setSupervisorId(event.target.value);
                }}
              >
                <option value="">Todos</option>
                {supervisors.map((supervisor) => (
                  <option key={supervisor.id} value={supervisor.id}>
                    {supervisor.name}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}
        </FilterBar>

        {actionMessage ? (
          <NoticeCard title={actionMessage} tone="success" />
        ) : null}

        {supportMessage ? (
          <NoticeCard title="Carga parcial" description={supportMessage} />
        ) : null}

        <DataTable
          columns={[
            {
              key: 'collaborator',
              header: 'Colaborador',
              render: (collaborator) => (
                <>
                  <strong>{collaborator.name}</strong>
                  <div className="hint">{collaborator.email}</div>
                  <div className="hint">
                    {collaborator.employeeCode} - CPF {collaborator.cpf}
                  </div>
                </>
              ),
            },
            {
              key: 'role',
              header: 'Cargo',
              render: (collaborator) => (
                <span
                  className={
                    collaborator.role === 'SUPERVISOR'
                      ? 'badge badge-in-progress'
                      : 'badge badge-completed'
                  }
                >
                  {collaborator.role === 'SUPERVISOR' ? 'Supervisor' : 'Promotor'}
                </span>
              ),
            },
            {
              key: 'region',
              header: 'Regiao',
              render: (collaborator) => collaborator.region ?? 'Sem regiao',
            },
            {
              key: 'supervision',
              header: 'Supervisor / Equipe',
              render: (collaborator) =>
                collaborator.role === 'PROMOTER' ? (
                  <>
                    <strong>{collaborator.supervisorName ?? 'Sem supervisor'}</strong>
                    <div className="hint">
                      Jornada padrao: {collaborator.defaultJourneyStartTime ?? '--:--'} a{' '}
                      {collaborator.defaultJourneyEndTime ?? '--:--'}
                    </div>
                  </>
                ) : (
                  <>
                    <strong>{collaborator.teamSize} promotores</strong>
                    <div className="hint">Equipe atualmente vinculada</div>
                  </>
                ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (collaborator) => (
                <span className={getStatusBadgeClassName(collaborator.status)}>
                  {statusLabels[collaborator.status]}
                </span>
              ),
            },
            {
              key: 'hireDate',
              header: 'Admissao',
              render: (collaborator) =>
                collaborator.hireDate
                  ? new Date(collaborator.hireDate).toLocaleDateString('pt-BR')
                  : '-',
            },
            {
              key: 'actions',
              header: '',
              render: (collaborator) => (
                <div className="row-actions">
                  <Link
                    className="button button-secondary"
                    href={`/dashboard/collaborators/${collaborator.id}`}
                  >
                    <UserCog size={14} />
                    Editar
                  </Link>
                  {collaborator.status !== 'TERMINATED' ? (
                    <button
                      className="button button-danger"
                      type="button"
                      onClick={() => setPendingToggle(collaborator)}
                    >
                      {collaborator.status === 'ACTIVE' ? 'Inativar' : 'Reativar'}
                    </button>
                  ) : null}
                </div>
              ),
            },
          ]}
          emptyTitle={isSupervisorManager ? 'Nenhum promotor encontrado' : 'Nenhum colaborador encontrado'}
          emptyDescription={
            isSupervisorManager
              ? 'Ajuste os filtros ou cadastre um novo promotor para sua equipe.'
              : 'Ajuste os filtros ou cadastre um novo supervisor/promotor.'
          }
          getRowKey={(collaborator) => collaborator.id}
          items={data.items}
          mobileTitle={(collaborator) => collaborator.name}
          mobileSubtitle={(collaborator) => collaborator.email}
          mobileMeta={(collaborator) => (
            <span className={getStatusBadgeClassName(collaborator.status)}>
              {statusLabels[collaborator.status]}
            </span>
          )}
          mobileBody={(collaborator) => (
            <div className="stack">
              <p className="hint">
                {collaborator.role === 'SUPERVISOR' ? 'Supervisor' : 'Promotor'} -{' '}
                {collaborator.region ?? 'Sem regiao'}
              </p>
              <p className="hint">
                Matricula {collaborator.employeeCode} - CPF {collaborator.cpf}
              </p>
              <p className="hint">
                {collaborator.role === 'PROMOTER'
                  ? `Supervisor: ${collaborator.supervisorName ?? 'Sem supervisor'}`
                  : `Equipe vinculada: ${collaborator.teamSize} promotores`}
              </p>
            </div>
          )}
          mobileActions={(collaborator) => (
            <>
              <Link
                className="button button-secondary"
                href={`/dashboard/collaborators/${collaborator.id}`}
              >
                Editar
              </Link>
              {collaborator.status !== 'TERMINATED' ? (
                <button
                  className="button button-danger"
                  type="button"
                  onClick={() => setPendingToggle(collaborator)}
                >
                  {collaborator.status === 'ACTIVE' ? 'Inativar' : 'Reativar'}
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
        open={Boolean(pendingToggle && pendingToggleStatus)}
        title={pendingToggleStatus === 'ACTIVE' ? 'Reativar colaborador' : 'Inativar colaborador'}
        description={
          pendingToggle && pendingToggleStatus
            ? pendingToggleStatus === 'ACTIVE'
              ? `Reativar ${pendingToggle.name} para liberar acesso ao sistema?`
              : `Inativar ${pendingToggle.name} e bloquear o acesso ao sistema?`
            : ''
        }
        confirmLabel={pendingToggleStatus === 'ACTIVE' ? 'Reativar' : 'Inativar'}
        onCancel={() => setPendingToggle(null)}
        onConfirm={() => void handleStatusToggle()}
      />
    </div>
  );
}
