'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { canManageTeams } from '@promotor/types';
import { TeamForm, type TeamPromoterOption, type TeamSupervisorOption } from '@/features/admin/teams/components/team-form';
import {
  mapPromoterCollaboratorOption,
  mapPromoterSummaryOption,
  mapSupervisorOption,
} from '@/features/admin/teams/team-options';
import { ErrorState, LoadingState } from '@/components/page-states';
import { NoticeCard } from '@/components/ui/notice-card';
import { PageContainer } from '@/components/ui/layout-primitives';
import { PageHeader } from '@/components/ui/page-header';
import {
  ApiError,
  getCollaborators,
  getPromoters,
  getTeamDetail,
  updateTeam,
} from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { useHydrated } from '@/lib/use-hydrated';
import { getRequestErrorMessage, getSettledErrorMessage, getSettledValue } from '@/lib/request-state';
import type { TeamDetailResponse, TeamInput } from '@/lib/types';

const mergeCurrentMembersIntoOptions = (
  options: TeamPromoterOption[],
  detail: TeamDetailResponse,
) => {
  const optionMap = new Map(options.map((option) => [option.id, option]));

  detail.members.forEach((member) => {
    if (!optionMap.has(member.promoterId)) {
      optionMap.set(member.promoterId, {
        id: member.promoterId,
        name: member.promoterName,
        email: member.promoterEmail,
        employeeCode: member.employeeCode,
        region: member.region,
        status: member.status,
        active: member.active,
        supervisorName: member.supervisorName,
      });
    }
  });

  return [...optionMap.values()].sort((left, right) => left.name.localeCompare(right.name));
};

export default function EditTeamPage() {
  const params = useParams<{ teamId: string }>();
  const router = useRouter();
  const hydrated = useHydrated();
  const user = useAuthStore((state) => state.user);
  const teamId = params.teamId;
  const [team, setTeam] = useState<TeamDetailResponse | null>(null);
  const [supervisors, setSupervisors] = useState<TeamSupervisorOption[]>([]);
  const [promoters, setPromoters] = useState<TeamPromoterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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

      if (user.role === 'ADMIN') {
        const [teamResult, supervisorsResult, promotersResult] = await Promise.allSettled([
          getTeamDetail(teamId),
          getCollaborators({
            page: 1,
            pageSize: 100,
            role: 'SUPERVISOR',
            status: 'ACTIVE',
          }),
          getCollaborators({
            page: 1,
            pageSize: 300,
            role: 'PROMOTER',
          }),
        ]);

        const detail = getSettledValue(teamResult);

        if (!detail) {
          throw teamResult.status === 'rejected'
            ? teamResult.reason
            : new ApiError('Falha ao carregar equipe', 500);
        }

        const promoterOptions = mergeCurrentMembersIntoOptions(
          (getSettledValue(promotersResult)?.items ?? []).map(mapPromoterCollaboratorOption),
          detail,
        );

        setTeam(detail);
        setSupervisors((getSettledValue(supervisorsResult)?.items ?? []).map(mapSupervisorOption));
        setPromoters(promoterOptions);

        const supportErrors = [
          getSettledErrorMessage(
            supervisorsResult,
            'Nao foi possivel carregar os supervisores ativos.',
          ),
          getSettledErrorMessage(
            promotersResult,
            'Nao foi possivel carregar os promotores disponiveis.',
          ),
        ].filter(Boolean);

        setSupportMessage(supportErrors.length > 0 ? supportErrors.join(' ') : null);
      } else {
        const [detail, promoterOptions] = await Promise.all([
          getTeamDetail(teamId),
          getPromoters({
            page: 1,
            pageSize: 300,
          }),
        ]);

        setTeam(detail);
        setSupervisors([
          {
            id: user.id,
            name: user.name,
            email: user.email,
            employeeCode: '',
            region: detail.region ?? '',
          },
        ]);
        setPromoters(
          mergeCurrentMembersIntoOptions(
            promoterOptions.items.map(mapPromoterSummaryOption),
            detail,
          ),
        );
      }
    } catch (loadError) {
      setError(getRequestErrorMessage(loadError, 'Falha ao carregar equipe.'));
    } finally {
      setLoading(false);
    }
  }, [teamId, user]);

  useEffect(() => {
    if (!hydrated || !user || !canManage) {
      return;
    }

    void loadData();
  }, [canManage, hydrated, loadData, user]);

  const defaultValues = useMemo(() => {
    if (!team) {
      return undefined;
    }

    return {
      name: team.name,
      code: team.code,
      description: team.description ?? '',
      region: team.region ?? '',
      supervisorUserId: team.supervisorUserId ?? '',
      status: team.status,
      promoterIds: team.members.map((member) => member.promoterId),
    };
  }, [team]);

  const handleSubmit = async (values: TeamInput) => {
    try {
      setSaving(true);
      setSubmitError(null);
      const updated = await updateTeam(teamId, values);
      router.push(`/dashboard/teams/${updated.id}`);
    } catch (saveError) {
      setSubmitError(saveError instanceof ApiError ? saveError.message : 'Falha ao salvar equipe.');
    } finally {
      setSaving(false);
    }
  };

  if (!hydrated || !user) {
    return <LoadingState message="Carregando sessao..." />;
  }

  if (!canManage) {
    return <LoadingState message="Redirecionando..." />;
  }

  if (loading) {
    return <LoadingState message="Carregando equipe..." />;
  }

  if (!team || error) {
    return <ErrorState message={error ?? 'Equipe nao encontrada.'} onRetry={() => void loadData()} />;
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Editar equipe"
        title={`Editar ${team.name}`}
        description="Atualize dados cadastrais, status, supervisor responsavel e promotores vinculados."
        actions={
          <Link className="button button-secondary" href={`/dashboard/teams/${team.id}`}>
            <ChevronLeft size={16} />
            Voltar para detalhes
          </Link>
        }
      />

      {supportMessage ? <NoticeCard title="Carga parcial" description={supportMessage} /> : null}

      <TeamForm
        mode="edit"
        defaultValues={defaultValues}
        supervisors={supervisors}
        promoters={promoters}
        saving={saving}
        submitError={submitError}
        cancelHref={`/dashboard/teams/${team.id}`}
        supervisorLocked={user.role === 'SUPERVISOR'}
        onSubmit={handleSubmit}
      />
    </PageContainer>
  );
}
