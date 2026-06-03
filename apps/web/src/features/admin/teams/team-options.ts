import type { CollaboratorSummary, PromotersListResponse } from '@/lib/types';
import type {
  TeamPromoterOption,
  TeamSupervisorOption,
} from './components/team-form';

export const mapSupervisorOption = (
  collaborator: CollaboratorSummary,
): TeamSupervisorOption => ({
  id: collaborator.id,
  name: collaborator.name,
  email: collaborator.email,
  employeeCode: collaborator.employeeCode,
  region: collaborator.region,
});

export const mapPromoterCollaboratorOption = (
  collaborator: CollaboratorSummary,
): TeamPromoterOption => ({
  id: collaborator.id,
  name: collaborator.name,
  email: collaborator.email,
  employeeCode: collaborator.employeeCode,
  region: collaborator.region,
  status: collaborator.status,
  active: collaborator.active,
  supervisorName: collaborator.supervisorName,
});

export const mapPromoterSummaryOption = (
  promoter: PromotersListResponse['items'][number],
): TeamPromoterOption => ({
  id: promoter.id,
  name: promoter.name,
  email: promoter.email,
  employeeCode: promoter.employeeCode,
  region: null,
  status: promoter.active ? 'ACTIVE' : 'INACTIVE',
  active: promoter.active,
  supervisorName: promoter.supervisorName,
});
