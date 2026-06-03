'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { ApiError, createTeam, getCollaborators, getPromoters } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { useHydrated } from '@/lib/use-hydrated';
import { getRequestErrorMessage, getSettledErrorMessage, getSettledValue } from '@/lib/request-state';
import type { TeamInput } from '@/lib/types';

export default function NewTeamPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const user = useAuthStore((state) => state.user);
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

  const loadOptions = useCallback(async () => {
    if (!user) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSupportMessage(null);

      if (user.role === 'ADMIN') {
        const [supervisorsResult, promotersResult] = await Promise.allSettled([
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

        setSupervisors((getSettledValue(supervisorsResult)?.items ?? []).map(mapSupervisorOption));
        setPromoters(
          (getSettledValue(promotersResult)?.items ?? []).map(mapPromoterCollaboratorOption),
        );

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
        setSupervisors([
          {
            id: user.id,
            name: user.name,
            email: user.email,
            employeeCode: '',
            region: '',
          },
        ]);

        const promoterOptions = await getPromoters({
          page: 1,
          pageSize: 300,
        });
        setPromoters(promoterOptions.items.map(mapPromoterSummaryOption));
      }
    } catch (loadError) {
      setError(getRequestErrorMessage(loadError, 'Falha ao carregar opcoes da equipe.'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!hydrated || !user || !canManage) {
      return;
    }

    void loadOptions();
  }, [canManage, hydrated, loadOptions, user]);

  const handleSubmit = async (values: TeamInput) => {
    try {
      setSaving(true);
      setSubmitError(null);
      const created = await createTeam(values);
      router.push(`/dashboard/teams/${created.id}`);
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
    return <LoadingState message="Preparando cadastro de equipe..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void loadOptions()} />;
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Nova equipe"
        title="Cadastrar equipe de promotores"
        description="Defina identificacao unica, supervisor responsavel e promotores vinculados para organizar a operacao."
        actions={
          <Link className="button button-secondary" href="/dashboard/teams">
            <ChevronLeft size={16} />
            Voltar para equipes
          </Link>
        }
      />

      {supportMessage ? <NoticeCard title="Carga parcial" description={supportMessage} /> : null}

      <TeamForm
        mode="create"
        supervisors={supervisors}
        promoters={promoters}
        saving={saving}
        submitError={submitError}
        cancelHref="/dashboard/teams"
        supervisorLocked={user.role === 'SUPERVISOR'}
        defaultValues={
          user.role === 'SUPERVISOR'
            ? {
                supervisorUserId: user.id,
              }
            : undefined
        }
        onSubmit={handleSubmit}
      />
    </PageContainer>
  );
}
