import { z } from 'zod';
import type {
  BatchRoutePlanInput,
  CollaboratorCreateInput,
  CollaboratorInput,
  CustomerInput,
  TeamInput,
  RouteTemplateInput,
  RoutePlanInput,
} from './types';

const collaboratorBaseSchema = z
  .object({
    name: z.string().trim().min(3, 'Informe o nome completo.'),
    email: z.email({ message: 'Informe um email valido.' }),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9()+\-\s]{10,20}$/, 'Informe um telefone valido.'),
    cpf: z
      .string()
      .trim()
      .regex(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, 'Informe um CPF valido.'),
    employeeCode: z.string().trim().min(3, 'Informe a matricula.'),
    role: z.enum(['PROMOTER', 'SUPERVISOR']),
    status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED']),
    hireDate: z.string().trim().min(1, 'Informe a data de admissao.'),
    region: z.string().trim().min(2, 'Informe a regiao.'),
    notes: z.string().trim().max(1000).optional().or(z.literal('')),
    supervisorId: z.string().optional().or(z.literal('')),
    defaultJourneyStartTime: z.string().optional().or(z.literal('')),
    defaultJourneyEndTime: z.string().optional().or(z.literal('')),
    teamPromoterIds: z.array(z.string()).optional(),
  })
  .superRefine((input, context) => {
    if (input.role === 'PROMOTER' && !input.supervisorId?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['supervisorId'],
        message: 'Selecione o supervisor responsavel.',
      });
    }
  });

export const collaboratorCreateSchema = collaboratorBaseSchema.extend({
  initialPassword: z.string().min(8, 'A senha inicial deve ter pelo menos 8 caracteres.'),
});

export const collaboratorUpdateSchema = collaboratorBaseSchema;

export const teamSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da equipe.'),
  code: z.string().trim().min(2, 'Informe o codigo da equipe.'),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  region: z.string().trim().max(120).optional().or(z.literal('')),
  supervisorUserId: z.string().optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  promoterIds: z.array(z.string()).default([]),
});

export const validateCustomerInput = (input: CustomerInput) => {
  const errors: string[] = [];

  if (!input.code.trim()) {
    errors.push('Informe o codigo do cliente.');
  }

  if (!input.tradeName.trim()) {
    errors.push('Informe o nome fantasia.');
  }

  if (!input.legalName.trim()) {
    errors.push('Informe a razao social.');
  }

  if (!input.cnpj.trim().match(/^\d{14}$/)) {
    errors.push('Informe um CNPJ valido com 14 digitos.');
  }

  if (!input.contactName.trim()) {
    errors.push('Informe o contato principal.');
  }

  if (!input.phone.trim()) {
    errors.push('Informe o telefone.');
  }

  if (!input.address.trim()) {
    errors.push('Informe o endereco.');
  }

  if (!input.district.trim()) {
    errors.push('Informe o bairro.');
  }

  if (!input.city.trim() || !input.state.trim()) {
    errors.push('Informe cidade e UF.');
  }

  if (!input.routeName.trim()) {
    errors.push('Informe a rota.');
  }

  if (!input.region.trim()) {
    errors.push('Informe a regiao.');
  }

  if (!input.supervisorUserId.trim()) {
    errors.push('Selecione o supervisor responsavel.');
  }

  if (!input.notes.trim()) {
    errors.push('Informe observacoes do cliente.');
  }

  if (input.geofenceRadiusM < 20) {
    errors.push('A geofence minima precisa ser de 20 metros.');
  }

  return errors;
};

export const validateRoutePlanInput = (input: RoutePlanInput) => {
  const errors: string[] = [];

  if (!input.routeDate) {
    errors.push('Informe a data do roteiro.');
  }

  if (!input.promoterId) {
    errors.push('Selecione um promotor.');
  }

  if (input.items.length === 0) {
    errors.push('Inclua pelo menos um cliente no roteiro.');
    return errors;
  }

  const customerIds = input.items.map((item) => item.customerId).filter(Boolean);
  const sequences = input.items.map((item) => item.sequence);

  if (customerIds.length !== input.items.length) {
    errors.push('Todas as linhas do roteiro precisam ter um cliente.');
  }

  if (new Set(customerIds).size !== customerIds.length) {
    errors.push('Um cliente nao pode se repetir no mesmo roteiro.');
  }

  if (new Set(sequences).size !== sequences.length) {
    errors.push('A sequencia precisa ser unica por parada.');
  }

  return errors;
};

export const validateBatchRoutePlanInput = (input: BatchRoutePlanInput) => {
  const errors = validateRoutePlanInput({
    routeDate: input.startDate,
    promoterId: input.promoterId,
    planningView: input.planningView,
    status: input.status,
    sourceTemplateId: input.sourceTemplateId,
    publishNow: input.publishNow,
    notes: input.notes,
    items: input.items,
  });

  if (!input.startDate || !input.endDate) {
    errors.push('Informe a data inicial e a data final do planejamento.');
  }

  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    errors.push('A data final nao pode ser anterior a data inicial.');
  }

  return errors;
};

export const validateRouteTemplateInput = (input: RouteTemplateInput) => {
  const errors: string[] = [];

  if (!input.name.trim()) {
    errors.push('Informe o nome do modelo recorrente.');
  }

  if (!input.promoterId.trim()) {
    errors.push('Selecione o promotor do modelo.');
  }

  if (input.items.length === 0) {
    errors.push('Inclua pelo menos um cliente no modelo.');
    return errors;
  }

  const customerIds = input.items.map((item) => item.customerId).filter(Boolean);

  if (customerIds.length !== input.items.length) {
    errors.push('Todas as linhas do modelo precisam ter um cliente.');
  }

  if (input.effectiveFrom && input.effectiveUntil && input.effectiveUntil < input.effectiveFrom) {
    errors.push('A vigencia final nao pode ser anterior ao inicio.');
  }

  return errors;
};

export const validateCollaboratorInput = (
  input: CollaboratorInput | CollaboratorCreateInput,
  options?: {
    requireInitialPassword?: boolean;
  },
) => {
  const schema = options?.requireInitialPassword
    ? collaboratorCreateSchema
    : collaboratorUpdateSchema;
  const result = schema.safeParse(input);

  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) => issue.message);
};

export const validateTeamInput = (input: TeamInput) => {
  const result = teamSchema.safeParse(input);

  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) => issue.message);
};
