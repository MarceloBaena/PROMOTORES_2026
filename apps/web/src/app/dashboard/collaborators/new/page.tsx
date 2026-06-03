'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { canManageCollaborators } from '@promotor/types';
import { CollaboratorForm } from '@/features/admin/collaborators/components/collaborator-form';
import { ErrorState, LoadingState } from '@/components/page-states';
import { PageContainer } from '@/components/ui/layout-primitives';
import { NoticeCard } from '@/components/ui/notice-card';
import { PageHeader } from '@/components/ui/page-header';
import { ApiError, createCollaborator, getCollaborators } from '@/lib/api';
import { getRequestErrorMessage, getSettledErrorMessage, getSettledValue } from '@/lib/request-state';
import type { CollaboratorCreateInput, CollaboratorInput, CollaboratorSummary } from '@/lib/types';
import { useAuthStore } from '@/lib/auth-store';
import { useHydrated } from '@/lib/use-hydrated';

export default function NewCollaboratorPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const user = useAuthStore((state) => state.user);
  const userRole = user?.role ?? null;
  const canManage = userRole ? canManageCollaborators(userRole) : false;
  const isSupervisorManager = userRole === 'SUPERVISOR';
  const [supervisors, setSupervisors] = useState<CollaboratorSummary[]>([]);
  const [promoters, setPromoters] = useState<CollaboratorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!canManage) {
      router.replace('/dashboard');
    }
  }, [canManage, hydrated, router]);

  const loadOptions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSupportMessage(null);

      if (isSupervisorManager) {
        setSupervisors([]);
        setPromoters([]);
        return;
      }

      const [supervisorOptionsResult, promoterOptionsResult] = await Promise.allSettled([
        getCollaborators({
          page: 1,
          pageSize: 100,
          role: 'SUPERVISOR',
          status: 'ACTIVE',
        }),
        getCollaborators({
          page: 1,
          pageSize: 100,
          role: 'PROMOTER',
          status: 'ACTIVE',
        }),
      ]);

      setSupervisors(getSettledValue(supervisorOptionsResult)?.items ?? []);
      setPromoters(getSettledValue(promoterOptionsResult)?.items ?? []);

      const supportErrors = [
        getSettledErrorMessage(
          supervisorOptionsResult,
          'Nao foi possivel carregar os supervisores ativos.',
        ),
        getSettledErrorMessage(
          promoterOptionsResult,
          'Nao foi possivel carregar a equipe de promotores para vinculacao.',
        ),
      ].filter(Boolean);

      setSupportMessage(supportErrors.length > 0 ? supportErrors.join(' ') : null);
    } catch (loadError) {
      setError(getRequestErrorMessage(loadError, 'Falha ao carregar opcoes do cadastro'));
    } finally {
      setLoading(false);
    }
  }, [isSupervisorManager]);

  useEffect(() => {
    if (!hydrated || !canManage) {
      return;
    }

    void loadOptions();
  }, [canManage, hydrated, loadOptions]);

  const handleSubmit = async (values: CollaboratorInput & { initialPassword?: string }) => {
    try {
      setSaving(true);
      setSubmitError(null);
      const payload: CollaboratorCreateInput = {
        ...(values as CollaboratorInput),
        initialPassword: values.initialPassword ?? '',
      };
      const created = await createCollaborator(payload);
      router.push(`/dashboard/collaborators/${created.id}`);
    } catch (saveError) {
      setSubmitError(
        saveError instanceof ApiError ? saveError.message : 'Falha ao cadastrar colaborador',
      );
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
    return <LoadingState message="Preparando cadastro..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void loadOptions()} />;
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow={isSupervisorManager ? 'Novo promotor' : 'Novo colaborador'}
        title={
          isSupervisorManager
            ? 'Cadastro rapido para ampliar a equipe de campo'
            : 'Cadastro pronto para liberar acesso e operacao'
        }
        description={
          isSupervisorManager
            ? 'O promotor sera criado automaticamente sob sua supervisao, com jornada padrao e acesso inicial.'
            : 'Preencha os dados basicos, defina o perfil e vincule o contexto operacional do colaborador antes do primeiro acesso.'
        }
        actions={
          <Link className="button button-secondary" href="/dashboard/collaborators">
            <ChevronLeft size={16} />
            Voltar para colaboradores
          </Link>
        }
      />

      {supportMessage ? (
        <NoticeCard title="Carga parcial" description={supportMessage} />
      ) : null}

      <CollaboratorForm
        mode="create"
        supervisors={supervisors}
        promoters={promoters}
        currentUserRole={user.role}
        currentUserId={user.id}
        currentUserName={user.name}
        saving={saving}
        submitError={submitError}
        onSubmit={handleSubmit}
      />
    </PageContainer>
  );
}
