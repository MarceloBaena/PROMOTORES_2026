import { describe, expect, it } from 'vitest';
import {
  canAccessPromoterApp,
  canAccessSupervisorPanel,
  canManageCollaborators,
  canManageTeams,
} from './access';

describe('access rules', () => {
  it('permite admin e supervisor no painel web', () => {
    expect(canAccessSupervisorPanel('ADMIN')).toBe(true);
    expect(canAccessSupervisorPanel('SUPERVISOR')).toBe(true);
    expect(canAccessSupervisorPanel('PROMOTER')).toBe(false);
  });

  it('permite apenas promotor no app mobile operacional', () => {
    expect(canAccessPromoterApp('PROMOTER')).toBe(true);
    expect(canAccessPromoterApp('ADMIN')).toBe(false);
    expect(canAccessPromoterApp('SUPERVISOR')).toBe(false);
  });

  it('permite admin e supervisor no modulo de colaboradores', () => {
    expect(canManageCollaborators('ADMIN')).toBe(true);
    expect(canManageCollaborators('SUPERVISOR')).toBe(true);
    expect(canManageCollaborators('PROMOTER')).toBe(false);
  });

  it('permite admin e supervisor no modulo de equipes', () => {
    expect(canManageTeams('ADMIN')).toBe(true);
    expect(canManageTeams('SUPERVISOR')).toBe(true);
    expect(canManageTeams('PROMOTER')).toBe(false);
  });
});
