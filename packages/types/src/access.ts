import type { UserRole } from './types';

export const canAccessSupervisorPanel = (role: UserRole) =>
  role === 'ADMIN' || role === 'SUPERVISOR';

export const canAccessPromoterApp = (role: UserRole) => role === 'PROMOTER';

export const canManageCollaborators = (role: UserRole) =>
  role === 'ADMIN' || role === 'SUPERVISOR';

export const canManageTeams = (role: UserRole) =>
  role === 'ADMIN' || role === 'SUPERVISOR';
