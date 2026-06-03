'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, KeyRound } from 'lucide-react';
import { canManageCollaborators } from '@promotor/types';
import { CollaboratorForm } from '@/features/admin/collaborators/components/collaborator-form';
import { ErrorState, LoadingState } from '@/components/page-states';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormField } from '@/components/ui/form-field';
import { NoticeCard } from '@/components/ui/notice-card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import {
  ApiError,
  getCollaborator,
  getCollaborators,
  resetCollaboratorPassword,
  updateCollaborator,
  updateCollaboratorStatus,
} from '@/lib/api';
import { getRequestErrorMessage, getSettledErrorMessage, getSettledValue } from '@/lib/request-state';
import type {
  CollaboratorDetailResponse,
  CollaboratorInput,
  CollaboratorStatus,
  CollaboratorSummary,
} from '@/lib/types';
import { useAuthStore } from '@/lib/auth-store';
import { useHydrated } from '@/lib/use-hydrated';

const statusLabels: Record<CollaboratorStatus, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  TERMINATED: 'Desligado',
};

const toDateInputValue = (value?: string | null) =>
  value ? new Date(value).toISOString().slice(0, 10) : '';

export default function CollaboratorDetailPage() {
  const params = useParams<{ collaboratorId: string }>();
  const router = useRouter();
  const hydrated = useHydrated();
  const user = useAuthStore((state) => state.user);
  const userRole = user?.role ?? null;
  const canManage = userRole ? canManageCollaborators(userRole) : false;
  const isSupervisorManager = userRole === 'SUPERVISOR';
  const collaboratorId = params.collaboratorId;
  const [collaborator, setCollaborator] = useState<CollaboratorDetailResponse | null>(null);
  const [supervisors, setSupervisors] = useState<CollaboratorSummary[]>([]);
  const [promoters, setPromoters] = useState<CollaboratorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<CollaboratorStatus | null>(null);
  const [confirmPasswordReset, setConfirmPasswordReset] = useState(false);

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
        const detail = await getCollaborator(collaboratorId);
        setCollaborator(detail);
        setSupervisors([]);
        setPromoters([]);
        return;
      }

      const [detailResult, supervisorOptionsResult, promoterOptionsResult] = await Promise.allSettled([
        getCollaborator(collaboratorId),
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
        }),
      ]);

      const detail = getSettledValue(detailResult);

      if (!detail) {
        throw detailResult.status === 'rejected'
          ? detailResult.reason
          : new ApiError('Falha ao carregar colaborador', 500);
      }

      const supervisorOptions = getSettledValue(supervisorOptionsResult)?.items ?? [];
      const promoterOptions = getSettledValue(promoterOptionsResult)?.items ?? [];

      setCollaborator(detail);
      setSupervisors(supervisorOptions);
      setPromoters(promoterOptions.filter((item) => item.id !== collaboratorId));

      const supportErrors = [
        getSettledErrorMessage(
          supervisorOptionsResult,
          'Nao foi possivel carregar a lista de supervisores ativos.',
        ),
        getSettledErrorMessage(
          promoterOptionsResult,
          'Nao foi possivel carregar a equipe de promotores para vinculacao.',
        ),
      ].filter(Boolean);

      setSupportMessage(supportErrors.length > 0 ? supportErrors.join(' ') : null);
    } catch (loadError) {
      setError(getRequestErrorMessage(loadError, 'Falha ao carregar colaborador'));
    } finally {
      setLoading(false);
    }
  }, [collaboratorId, isSupervisorManager]);

  useEffect(() => {
    if (!hydrated || !canManage) {
      return;
    }

    void loadData();
  }, [canManage, hydrated, loadData]);

  const defaultValues = useMemo(() => {
    if (!collaborator) {
      return undefined;
    }

    return {
      name: collaborator.name,
      email: collaborator.email,
      phone: collaborator.phone ?? '',
      cpf: collaborator.cpf ?? '',
      employeeCode: collaborator.employeeCode ?? '',
      role: collaborator.role,
      status: collaborator.status,
      hireDate: toDateInputValue(collaborator.hireDate),
      region: collaborator.region ?? '',
      notes: collaborator.notes ?? '',
      supervisorId: collaborator.supervisorId ?? '',
      defaultJourneyStartTime: collaborator.defaultJourneyStartTime ?? '',
      defaultJourneyEndTime: collaborator.defaultJourneyEndTime ?? '',
      teamPromoterIds: collaborator.teamPromoterIds,
    };
  }, [collaborator]);

  const handleSubmit = async (values: CollaboratorInput & { initialPassword?: string }) => {
    try {
      setSaving(true);
      setSubmitError(null);
      setSuccessMessage(null);
      const payload = { ...values };
      delete payload.initialPassword;
      const updated = await updateCollaborator(collaboratorId, payload);
      setCollaborator(updated);
      setSuccessMessage('Cadastro atualizado com sucesso.');
    } catch (saveError) {
      setSubmitError(
        saveError instanceof ApiError ? saveError.message : 'Falha ao atualizar colaborador',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async () => {
    if (!collaborator || !pendingStatus) {
      return;
    }

    try {
      setSubmitError(null);
      setSuccessMessage(null);
      const updated = await updateCollaboratorStatus(collaboratorId, pendingStatus);
      setCollaborator(updated);
      setPendingStatus(null);
      setSuccessMessage(`Status alterado para ${statusLabels[pendingStatus]}.`);
    } catch (statusError) {
      setSubmitError(
        statusError instanceof ApiError
          ? statusError.message
          : 'Falha ao alterar status do colaborador',
      );
    }
  };

  const handlePasswordReset = async () => {
    if (!password || password.length < 8) {
      setPasswordError('Informe uma nova senha com pelo menos 8 caracteres.');
      return;
    }

    try {
      setResettingPassword(true);
      setPasswordError(null);
      setSuccessMessage(null);
      await resetCollaboratorPassword(collaboratorId, password);
      setPassword('');
      setConfirmPasswordReset(false);
      setSuccessMessage('Senha redefinida e sessoes anteriores revogadas.');
    } catch (resetError) {
      setPasswordError(
        resetError instanceof ApiError ? resetError.message : 'Falha ao redefinir a senha',
      );
    } finally {
      setResettingPassword(false);
    }
  };

  if (!hydrated || !user) {
    return <LoadingState message="Carregando sessao..." />;
  }

  if (!canManage) {
    return <LoadingState message="Redirecionando..." />;
  }

  if (loading) {
    return <LoadingState message="Carregando dados do colaborador..." />;
  }

  if (!collaborator || error) {
    return (
      <ErrorState message={error ?? 'Colaborador nao encontrado'} onRetry={() => void loadData()} />
    );
  }

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Edicao"
        title={collaborator.name}
        description="Ajuste dados cadastrais, equipe, supervisor responsavel, status de acesso e credenciais do colaborador."
        actions={
          <Link className="button button-secondary" href="/dashboard/collaborators">
            <ChevronLeft size={16} />
            Voltar para colaboradores
          </Link>
        }
      />

      {successMessage ? (
        <NoticeCard title={successMessage} tone="success" />
      ) : null}

      {supportMessage ? (
        <NoticeCard title="Carga parcial" description={supportMessage} />
      ) : null}

      <section className="split-grid split-grid-wide">
        <div>
          <CollaboratorForm
            mode="edit"
            defaultValues={defaultValues}
            supervisors={supervisors.filter(
              (item) => item.id === collaborator.supervisorId || item.id !== collaboratorId,
            )}
            promoters={promoters}
            currentUserRole={user.role}
            currentUserId={user.id}
            currentUserName={user.name}
            saving={saving}
            submitError={submitError}
            onSubmit={handleSubmit}
          />
        </div>

        <div className="page-grid">
          <SectionCard
            title="Status e acesso"
            description="O login e bloqueado imediatamente quando o colaborador deixa de estar ativo."
          >
            <div className="stack">
              <div className="list-card">
                <strong>Status atual: {statusLabels[collaborator.status]}</strong>
                <p className="hint">
                  Perfil: {collaborator.role === 'PROMOTER' ? 'Promotor' : 'Supervisor'}
                </p>
              </div>

              <ActionButtons
                onActivate={() => setPendingStatus('ACTIVE')}
                onInactivate={() => setPendingStatus('INACTIVE')}
                onTerminate={() => setPendingStatus('TERMINATED')}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Redefinir senha"
            description="A nova senha revoga as sessoes correntes e passa a valer no proximo login."
          >
            <FormField label="Nova senha">
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Nova senha segura"
              />
            </FormField>

            {passwordError ? <div className="error-text">{passwordError}</div> : null}

            <div className="row-actions">
              <button
                className="button button-primary"
                type="button"
                disabled={resettingPassword}
                onClick={() => setConfirmPasswordReset(true)}
              >
                <KeyRound size={16} />
                {resettingPassword ? 'Redefinindo...' : 'Redefinir senha'}
              </button>
            </div>
          </SectionCard>

          {collaborator.role === 'SUPERVISOR' ? (
            <SectionCard
              title="Equipe atual"
              description="Promotores vinculados diretamente ao supervisor."
            >
              <div className="stack">
                {collaborator.teamPromoters.length === 0 ? (
                  <div className="empty-state">
                    <strong>Nenhum promotor vinculado</strong>
                    <p className="hint">Use o formulario para vincular a equipe operacional.</p>
                  </div>
                ) : (
                  collaborator.teamPromoters.map((teamPromoter) => (
                    <div key={teamPromoter.id} className="list-card">
                      <strong>{teamPromoter.name}</strong>
                      <p className="hint">
                        {teamPromoter.employeeCode} - {teamPromoter.email}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </SectionCard>
          ) : null}
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(pendingStatus)}
        title="Alterar status do colaborador"
        description={
          pendingStatus
            ? `Alterar o status de ${collaborator.name} para ${statusLabels[pendingStatus]}?`
            : ''
        }
        confirmLabel="Confirmar alteracao"
        onCancel={() => setPendingStatus(null)}
        onConfirm={() => void handleStatusChange()}
      />

      <ConfirmDialog
        open={confirmPasswordReset}
        title="Redefinir senha"
        description="Redefinir a senha e revogar as sessoes ativas desse colaborador?"
        confirmLabel="Redefinir senha"
        onCancel={() => setConfirmPasswordReset(false)}
        onConfirm={() => void handlePasswordReset()}
      />
    </div>
  );
}

function ActionButtons({
  onActivate,
  onInactivate,
  onTerminate,
}: {
  onActivate: () => void;
  onInactivate: () => void;
  onTerminate: () => void;
}) {
  return (
    <div className="row-actions">
      <button className="button button-secondary" type="button" onClick={onActivate}>
        Ativar
      </button>
      <button className="button button-danger" type="button" onClick={onInactivate}>
        Inativar
      </button>
      <button className="button button-danger" type="button" onClick={onTerminate}>
        Desligar
      </button>
    </div>
  );
}
