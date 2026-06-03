import { canAccessPromoterApp, canAccessSupervisorPanel, type UserRole } from '@promotor/types';

export const canAccessWebPortal = (role: UserRole) =>
  canAccessSupervisorPanel(role) || canAccessPromoterApp(role);

export const getDefaultRouteForRole = (role: UserRole) => {
  if (canAccessSupervisorPanel(role)) {
    return '/dashboard';
  }

  if (canAccessPromoterApp(role)) {
    return '/workspace';
  }

  return '/';
};
