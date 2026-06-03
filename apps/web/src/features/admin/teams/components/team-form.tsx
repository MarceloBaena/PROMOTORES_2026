'use client';

import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FooterActionBar } from '@/components/ui/action-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { PageContainer, ResponsiveFormGrid } from '@/components/ui/layout-primitives';
import { SectionCard } from '@/components/ui/section-card';
import { teamSchema } from '@/lib/form-validation';
import type { CollaboratorStatus, TeamInput } from '@/lib/types';

type TeamFormValues = z.input<typeof teamSchema>;

export type TeamSupervisorOption = {
  id: string;
  name: string;
  email: string;
  employeeCode?: string | null;
  region?: string | null;
};

export type TeamPromoterOption = {
  id: string;
  name: string;
  email: string;
  employeeCode?: string | null;
  region?: string | null;
  status: CollaboratorStatus;
  active: boolean;
  supervisorName?: string | null;
};

interface TeamFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<TeamFormValues>;
  supervisors: TeamSupervisorOption[];
  promoters: TeamPromoterOption[];
  saving: boolean;
  submitError?: string | null;
  cancelHref: string;
  supervisorLocked?: boolean;
  onSubmit: (values: TeamInput) => Promise<void>;
}

const statusLabels: Record<CollaboratorStatus, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  TERMINATED: 'Desligado',
};

const createDefaultValues = (defaults?: Partial<TeamFormValues>): TeamFormValues => ({
  name: defaults?.name ?? '',
  code: defaults?.code ?? '',
  description: defaults?.description ?? '',
  region: defaults?.region ?? '',
  supervisorUserId: defaults?.supervisorUserId ?? '',
  status: defaults?.status ?? 'ACTIVE',
  promoterIds: defaults?.promoterIds ?? [],
});

export const TeamForm = ({
  mode,
  defaultValues,
  supervisors,
  promoters,
  saving,
  submitError,
  cancelHref,
  supervisorLocked = false,
  onSubmit,
}: TeamFormProps) => {
  const [promoterSearch, setPromoterSearch] = useState('');
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    control,
    formState: { errors },
  } = useForm<TeamFormValues>({
    resolver: zodResolver(teamSchema),
    defaultValues: createDefaultValues(defaultValues),
  });

  const selectedPromoterIds =
    useWatch({
      control,
      name: 'promoterIds',
    }) ?? [];

  useEffect(() => {
    reset(createDefaultValues(defaultValues));
  }, [defaultValues, reset]);

  const filteredPromoters = useMemo(() => {
    const normalizedSearch = promoterSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return promoters;
    }

    return promoters.filter((promoter) =>
      [
        promoter.name,
        promoter.email,
        promoter.employeeCode ?? '',
        promoter.region ?? '',
        promoter.supervisorName ?? '',
      ].some((value) => value.toLowerCase().includes(normalizedSearch)),
    );
  }, [promoterSearch, promoters]);

  const togglePromoter = (promoterId: string, checked: boolean) => {
    const nextPromoterIds = checked
      ? [...new Set([...selectedPromoterIds, promoterId])]
      : selectedPromoterIds.filter((value) => value !== promoterId);

    setValue('promoterIds', nextPromoterIds, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const submit = handleSubmit(async (values) => {
    const payload: TeamInput = {
      name: values.name,
      code: values.code,
      status: values.status,
      description: values.description?.trim() || undefined,
      region: values.region?.trim() || undefined,
      supervisorUserId: values.supervisorUserId?.trim() || undefined,
      promoterIds: values.promoterIds ?? [],
    };

    await onSubmit(payload);
  });

  return (
    <PageContainer as="form" onSubmit={submit}>
      <SectionCard
        title="Dados da equipe"
        description="Defina identificacao unica, regiao operacional, supervisor responsavel e situacao da equipe."
      >
        <ResponsiveFormGrid>
          <FormField label="Nome da equipe" error={errors.name?.message}>
            <input className="input" {...register('name')} />
          </FormField>

          <FormField label="Codigo da equipe" error={errors.code?.message}>
            <input className="input" {...register('code')} />
          </FormField>

          <FormField label="Regiao" error={errors.region?.message}>
            <input className="input" {...register('region')} />
          </FormField>

          <FormField label="Status" error={errors.status?.message}>
            <select className="select" {...register('status')}>
              <option value="ACTIVE">Ativa</option>
              <option value="INACTIVE">Inativa</option>
            </select>
          </FormField>

          <FormField
            label="Supervisor responsavel"
            error={errors.supervisorUserId?.message}
            span={2}
          >
            <select className="select" {...register('supervisorUserId')} disabled={supervisorLocked}>
              <option value="">Sem supervisor definido</option>
              {supervisors.map((supervisor) => (
                <option key={supervisor.id} value={supervisor.id}>
                  {supervisor.name}
                  {supervisor.employeeCode ? ` - ${supervisor.employeeCode}` : ''}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Descricao" span={2} error={errors.description?.message}>
            <textarea className="textarea" {...register('description')} />
          </FormField>
        </ResponsiveFormGrid>
      </SectionCard>

      <SectionCard
        title="Promotores vinculados"
        description="Selecione um ou varios promotores para compor a equipe. Use a busca para localizar mais rapido."
      >
        <div className="stack">
          <FormField label="Buscar promotor">
            <input
              className="input"
              value={promoterSearch}
              onChange={(event) => setPromoterSearch(event.target.value)}
              placeholder="Nome, email, matricula, regiao ou supervisor"
            />
          </FormField>

          <div className="hint">{selectedPromoterIds.length} promotor(es) selecionado(s).</div>

          {filteredPromoters.length === 0 ? (
            <EmptyState
              title="Nenhum promotor disponivel"
              description="Ajuste a busca ou cadastre promotores para vincular a equipe."
            />
          ) : (
            <div className="stack">
              {filteredPromoters.map((promoter) => (
                <label key={promoter.id} className="checkbox-row selection-card">
                  <input
                    checked={selectedPromoterIds.includes(promoter.id)}
                    type="checkbox"
                    onChange={(event) => togglePromoter(promoter.id, event.target.checked)}
                  />
                  <div>
                    <strong>{promoter.name}</strong>
                    <div className="hint">
                      {promoter.employeeCode ?? 'Sem matricula'} - {promoter.email}
                    </div>
                    <div className="hint">
                      {promoter.region ?? 'Sem regiao'}
                      {promoter.supervisorName ? ` - Supervisor: ${promoter.supervisorName}` : ''}
                    </div>
                  </div>
                  <span
                    className={promoter.active ? 'badge badge-completed' : 'badge badge-partial'}
                  >
                    {statusLabels[promoter.status]}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {submitError ? (
        <div className="error-state">
          <strong>{submitError}</strong>
        </div>
      ) : null}

      <FooterActionBar stickyOnMobile>
        <Link className="button button-secondary" href={cancelHref}>
          Cancelar
        </Link>
        <button className="button button-primary" type="submit" disabled={saving}>
          {saving
            ? 'Salvando...'
            : mode === 'create'
              ? 'Salvar equipe'
              : 'Salvar alteracoes'}
        </button>
      </FooterActionBar>
    </PageContainer>
  );
};
