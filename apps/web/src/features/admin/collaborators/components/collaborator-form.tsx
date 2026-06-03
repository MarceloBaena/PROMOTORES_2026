'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { UserRole } from '@promotor/types';
import { collaboratorCreateSchema, collaboratorUpdateSchema } from '@/lib/form-validation';
import type {
  CollaboratorCreateInput,
  CollaboratorInput,
  CollaboratorRole,
  CollaboratorStatus,
  CollaboratorSummary,
} from '@/lib/types';
import { FooterActionBar } from '@/components/ui/action-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { PageContainer, ResponsiveFormGrid } from '@/components/ui/layout-primitives';
import { SectionCard } from '@/components/ui/section-card';

type CollaboratorFormValues = CollaboratorInput & {
  initialPassword?: string;
};

interface CollaboratorFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<CollaboratorFormValues>;
  supervisors: CollaboratorSummary[];
  promoters: CollaboratorSummary[];
  currentUserRole?: UserRole | null;
  currentUserId?: string | null;
  currentUserName?: string | null;
  saving: boolean;
  submitError?: string | null;
  onSubmit: (values: CollaboratorFormValues) => Promise<void>;
}

const roleLabels: Record<CollaboratorRole, string> = {
  PROMOTER: 'Promotor',
  SUPERVISOR: 'Supervisor',
};

const statusLabels: Record<CollaboratorStatus, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  TERMINATED: 'Desligado',
};

const createDefaultValues = (
  defaults?: Partial<CollaboratorFormValues>,
): CollaboratorFormValues => ({
  name: defaults?.name ?? '',
  email: defaults?.email ?? '',
  phone: defaults?.phone ?? '',
  cpf: defaults?.cpf ?? '',
  employeeCode: defaults?.employeeCode ?? '',
  role: defaults?.role ?? 'PROMOTER',
  status: defaults?.status ?? 'ACTIVE',
  hireDate: defaults?.hireDate ?? '',
  region: defaults?.region ?? '',
  notes: defaults?.notes ?? '',
  supervisorId: defaults?.supervisorId ?? '',
  defaultJourneyStartTime: defaults?.defaultJourneyStartTime ?? '08:00',
  defaultJourneyEndTime: defaults?.defaultJourneyEndTime ?? '17:00',
  teamPromoterIds: defaults?.teamPromoterIds ?? [],
  initialPassword: defaults?.initialPassword ?? '',
});

export const CollaboratorForm = ({
  mode,
  defaultValues,
  supervisors,
  promoters,
  currentUserRole,
  currentUserId,
  currentUserName,
  saving,
  submitError,
  onSubmit,
}: CollaboratorFormProps) => {
  const isSupervisorManager = currentUserRole === 'SUPERVISOR';
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    control,
    formState: { errors },
  } = useForm<CollaboratorFormValues>({
    resolver: zodResolver(mode === 'create' ? collaboratorCreateSchema : collaboratorUpdateSchema),
    defaultValues: createDefaultValues(defaultValues),
  });

  const role = useWatch({
    control,
    name: 'role',
  });

  const teamPromoterIds =
    useWatch({
      control,
      name: 'teamPromoterIds',
    }) ?? [];

  useEffect(() => {
    reset(createDefaultValues(defaultValues));
  }, [defaultValues, reset]);

  useEffect(() => {
    if (!isSupervisorManager || !currentUserId) {
      return;
    }

    setValue('role', 'PROMOTER', {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: true,
    });
    setValue('supervisorId', currentUserId, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: true,
    });
  }, [currentUserId, isSupervisorManager, setValue]);

  const toggleTeamPromoter = (promoterId: string, checked: boolean) => {
    const nextTeam = checked
      ? [...new Set([...teamPromoterIds, promoterId])]
      : teamPromoterIds.filter((value) => value !== promoterId);

    setValue('teamPromoterIds', nextTeam, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const submit = handleSubmit(async (values) => {
    if (mode === 'create') {
      await onSubmit(values as CollaboratorCreateInput);
      return;
    }

    const payload = { ...values };
    delete payload.initialPassword;
    await onSubmit(payload);
  });

  return (
    <PageContainer as="form" onSubmit={submit}>
      <SectionCard
        title="Dados gerais"
        description="Identificacao unica, perfil de acesso e informacoes obrigatorias do colaborador."
      >
        <ResponsiveFormGrid>
          <FormField label="Nome completo" error={errors.name?.message}>
            <input className="input" {...register('name')} />
          </FormField>

          <FormField label="Email" error={errors.email?.message}>
            <input className="input" type="email" {...register('email')} />
          </FormField>

          <FormField label="Telefone" error={errors.phone?.message}>
            <input className="input" {...register('phone')} />
          </FormField>

          <FormField label="CPF" error={errors.cpf?.message}>
            <input className="input" {...register('cpf')} />
          </FormField>

          <FormField label="Matricula" error={errors.employeeCode?.message}>
            <input className="input" {...register('employeeCode')} />
          </FormField>

          <FormField
            label="Cargo"
            error={errors.role?.message}
            hint={
              mode === 'edit'
                ? 'Cargo travado para preservar historico operacional e relacional.'
                : isSupervisorManager
                  ? 'Supervisor cadastra apenas promotores do proprio escopo.'
                : undefined
            }
          >
            {isSupervisorManager ? (
              <>
                <input className="input" value="Promotor" readOnly disabled />
                <input type="hidden" {...register('role')} />
              </>
            ) : (
              <select className="select" {...register('role')} disabled={mode === 'edit'}>
                <option value="PROMOTER">Promotor</option>
                <option value="SUPERVISOR">Supervisor</option>
              </select>
            )}
          </FormField>

          <FormField label="Status" error={errors.status?.message}>
            <select className="select" {...register('status')}>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Data de admissao" error={errors.hireDate?.message}>
            <input className="input" type="date" {...register('hireDate')} />
          </FormField>

          <FormField label="Regiao" error={errors.region?.message}>
            <input className="input" {...register('region')} />
          </FormField>

          {mode === 'create' ? (
            <FormField label="Senha inicial" span={2} error={errors.initialPassword?.message}>
              <input className="input" type="password" {...register('initialPassword')} />
            </FormField>
          ) : null}

          <FormField label="Observacoes" span={2} error={errors.notes?.message}>
            <textarea className="textarea" {...register('notes')} />
          </FormField>
        </ResponsiveFormGrid>
      </SectionCard>

      {role === 'PROMOTER' ? (
        <SectionCard
          title="Configuracao do promotor"
          description="Supervisor obrigatorio e janela padrao de jornada para o fluxo operacional."
        >
          <ResponsiveFormGrid>
            <FormField label="Supervisor responsavel" span={2} error={errors.supervisorId?.message}>
              {isSupervisorManager ? (
                <>
                  <input
                    className="input"
                    value={currentUserName ?? 'Supervisor atual'}
                    readOnly
                    disabled
                  />
                  <input type="hidden" {...register('supervisorId')} />
                </>
              ) : (
                <select className="select" {...register('supervisorId')}>
                  <option value="">Selecione um supervisor</option>
                  {supervisors.map((supervisor) => (
                    <option key={supervisor.id} value={supervisor.id}>
                      {supervisor.name} - {supervisor.employeeCode}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField
              label="Inicio padrao da jornada"
              error={errors.defaultJourneyStartTime?.message}
            >
              <input className="input" type="time" {...register('defaultJourneyStartTime')} />
            </FormField>

            <FormField
              label="Fim padrao da jornada"
              error={errors.defaultJourneyEndTime?.message}
            >
              <input className="input" type="time" {...register('defaultJourneyEndTime')} />
            </FormField>
          </ResponsiveFormGrid>
        </SectionCard>
      ) : null}

      {role === 'SUPERVISOR' && !isSupervisorManager ? (
        <SectionCard
          title="Equipe vinculada"
          description="Escolha os promotores que esse supervisor passa a acompanhar no painel."
        >
          <div className="stack">
            {promoters.length === 0 ? (
              <EmptyState
                title="Nenhum promotor disponivel"
                description="Cadastre promotores primeiro para vincular uma equipe ao supervisor."
              />
            ) : (
              promoters.map((promoter) => (
                <label key={promoter.id} className="checkbox-row selection-card">
                  <input
                    checked={teamPromoterIds.includes(promoter.id)}
                    type="checkbox"
                    onChange={(event) => toggleTeamPromoter(promoter.id, event.target.checked)}
                  />
                  <div>
                    <strong>{promoter.name}</strong>
                    <div className="hint">
                      {promoter.employeeCode} - {promoter.region ?? 'Sem regiao'}
                    </div>
                  </div>
                  <span
                    className={
                      promoter.status === 'ACTIVE' ? 'badge badge-completed' : 'badge badge-partial'
                    }
                  >
                    {statusLabels[promoter.status]}
                  </span>
                </label>
              ))
            )}
          </div>
        </SectionCard>
      ) : null}

      {submitError ? (
        <div className="error-state">
          <strong>{submitError}</strong>
        </div>
      ) : null}

      <FooterActionBar stickyOnMobile>
        <button className="button button-primary" type="submit" disabled={saving}>
          {saving
            ? 'Salvando...'
            : mode === 'create'
              ? 'Cadastrar colaborador'
              : `Salvar ${roleLabels[role].toLowerCase()}`}
        </button>
      </FooterActionBar>
    </PageContainer>
  );
};
