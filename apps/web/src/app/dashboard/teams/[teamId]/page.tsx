'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, PencilLine } from 'lucide-react';
import { canManageTeams } from '@promotor/types';
import { ErrorState, LoadingState } from '@/components/page-states';
import { FooterActionBar } from '@/components/ui/action-bar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { NoticeCard } from '@/components/ui/notice-card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { ApiError, getTeamDetail, updateTeamStatus } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { useHydrated } from '@/lib/use-hydrated';
import { getRequestErrorMessage } from '@/lib/request-state';
import type { TeamDetailResponse, TeamStatus } from '@/lib/types';

const teamStatusLabels: Record<TeamStatus, string> = {
  ACTIVE: 'Ativa',
  INACTIVE: 'Inativa',
};

const getStatusBadgeClassName = (status: TeamStatus) =>
  status === 'ACTIVE' ? 'badge badge-completed' : 'badge badge-partial';

export default function TeamDetailPage() {
  const params = useParams<{ teamId: string }>();
  const router = useRouter();
  const hydrated = useHydrated();
  const user = useAuthStore((state) => state.user);
  const teamId = params.teamId;
  const [team, setTeam] = useState<TeamDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{
    message: string;
    tone: 'success' | 'warning';
  } | null>(null);
  const [pendingStatus, setPendingStatus] = useState<TeamStatus | null>(null);
  const canManage = user?.role ? canManageTeams(user.role) : false;

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!canManage) {
      router.replace('/dashboard');
    }
  }, [canManage, hydrated, router]);

  const loadTeam = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setTeam(await getTeamDetail(teamId));
    } catch (loadError) {
      setError(getRequestErrorMessage(loadError, 'Falha ao carregar a equipe.'));
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (!hydrated || !canManage) {
      return;
    }

    void loadTeam();
  }, [canManage, hydrated, loadTeam]);

  const nextStatus = useMemo<TeamStatus>(
    () => (team?.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'),
    [team?.status],
  );

  const handleToggleStatus = async () => {
    if (!team || !pendingStatus) {
      return;
    }

    try {
      await updateTeamStatus(team.id, pendingStatus);
      setPendingStatus(null);
      setActionNotice({
        message:
          pendingStatus === 'ACTIVE'
            ? 'Equipe reativada com sucesso.'
            : 'Equipe inativada com sucesso.',
        tone: 'success',
      });
      await loadTeam();
    } catch (statusError) {
      setActionNotice({
        message:
          statusError instanceof ApiError ? statusError.message : 'Falha ao atualizar a equipe.',
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
    return <LoadingState message="Carregando detalhes da equipe..." />;
  }

  if (!team || error) {
    return <ErrorState message={error ?? 'Equipe nao encontrada.'} onRetry={() => void loadTeam()} />;
  }

  return (
    <div className="page-grid team-detail-page">
      <PageHeader
        eyebrow="Detalhe da equipe"
        title={team.name}
        description="Acompanhe os dados principais da equipe e os promotores atualmente vinculados."
        meta={
          <div className="team-detail-header-meta">
            <span className="list-card">
              <strong>Codigo da equipe</strong>
              <span className="hint">{team.code}</span>
            </span>
          </div>
        }
        actions={
          <div className="row-actions team-detail-header-actions">
            <Link className="button button-secondary" href={`/dashboard/teams/${team.id}/edit`}>
              <PencilLine size={16} />
              Editar equipe
            </Link>
            <button className="button button-danger" type="button" onClick={() => setPendingStatus(nextStatus)}>
              {team.status === 'ACTIVE' ? 'Inativar equipe' : 'Ativar equipe'}
            </button>
          </div>
        }
      />

      {actionNotice ? <NoticeCard title={actionNotice.message} tone={actionNotice.tone} /> : null}

      <SectionCard
        title="Informacoes principais"
        description="Dados centrais da equipe para consulta rapida."
      >
        <div className="team-detail-info-grid">
          <div className="list-card">
            <strong>Supervisor responsavel</strong>
            <p className="hint">{team.supervisorName ?? 'Sem supervisor definido'}</p>
          </div>
          <div className="list-card">
            <strong>Regiao</strong>
            <p className="hint">{team.region ?? 'Nao informada'}</p>
          </div>
          <div className="list-card">
            <strong>Status</strong>
            <p className="hint">
              <span className={getStatusBadgeClassName(team.status)}>
                {teamStatusLabels[team.status]}
              </span>
            </p>
          </div>
          <div className="list-card team-detail-description-card">
            <strong>Descricao</strong>
            <p className="hint">{team.description?.trim() || 'Sem descricao cadastrada.'}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Resumo" description="Indicadores essenciais e datas do cadastro.">
        <div className="team-detail-summary-grid">
          <div className="list-card">
            <strong>Quantidade de promotores</strong>
            <p className="hint">{team.promotersCount}</p>
          </div>
          <div className="list-card">
            <strong>Data de criacao</strong>
            <p className="hint">{new Date(team.createdAt).toLocaleString('pt-BR')}</p>
          </div>
          <div className="list-card">
            <strong>Ultima atualizacao</strong>
            <p className="hint">{new Date(team.updatedAt).toLocaleString('pt-BR')}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Promotores vinculados"
        description="Lista simples dos promotores atualmente associados a esta equipe."
      >
        {team.members.length === 0 ? (
          <EmptyState
            title="Nenhum promotor vinculado"
            description="Adicione promotores na edicao da equipe para montar a estrutura operacional."
          />
        ) : (
          <div className="team-detail-members-list">
            {team.members.map((member) => (
              <article key={member.id} className="team-detail-member-card">
                <div className="team-detail-member-copy">
                  <div className="team-detail-member-header">
                    <strong>{member.promoterName}</strong>
                    <span className={member.active ? 'badge badge-completed' : 'badge badge-partial'}>
                      {member.status === 'ACTIVE'
                        ? 'Ativo'
                        : member.status === 'INACTIVE'
                          ? 'Inativo'
                          : 'Desligado'}
                    </span>
                  </div>
                  <p className="hint">
                    {member.employeeCode || 'Sem matricula'} - {member.promoterEmail}
                  </p>
                  <p className="hint">
                    {member.region ?? 'Sem regiao'}
                    {member.supervisorName ? ` - Supervisor: ${member.supervisorName}` : ''}
                  </p>
                </div>

                <div className="team-detail-member-actions">
                  <Link
                    className="button button-secondary"
                    href={`/dashboard/collaborators/${member.promoterUserId}`}
                  >
                    Ver colaborador
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>

      <FooterActionBar stickyOnMobile>
        <Link className="button button-secondary" href="/dashboard/teams">
          <ChevronLeft size={16} />
          Voltar
        </Link>
        <Link className="button button-primary" href={`/dashboard/teams/${team.id}/edit`}>
          <PencilLine size={16} />
          Editar equipe
        </Link>
      </FooterActionBar>

      <ConfirmDialog
        open={Boolean(pendingStatus)}
        title={pendingStatus === 'ACTIVE' ? 'Ativar equipe' : 'Inativar equipe'}
        description={
          pendingStatus
            ? pendingStatus === 'ACTIVE'
              ? `Reativar a equipe ${team.name} para uso operacional?`
              : `Inativar a equipe ${team.name}? Ela deixara de ser elegivel para novos roteiros.`
            : ''
        }
        confirmLabel={pendingStatus === 'ACTIVE' ? 'Ativar' : 'Inativar'}
        onCancel={() => setPendingStatus(null)}
        onConfirm={() => void handleToggleStatus()}
      />
    </div>
  );
}
