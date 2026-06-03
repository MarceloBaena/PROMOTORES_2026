import { describe, expect, it } from 'vitest';
import {
  canAccessDashboardRoute,
  getVisibleDashboardNavigation,
} from './navigation';

describe('dashboard navigation access', () => {
  it('mostra modulo de colaboradores para admin e supervisor', () => {
    expect(
      getVisibleDashboardNavigation('ADMIN').some((item) => item.href === '/dashboard/collaborators'),
    ).toBe(true);

    expect(
      getVisibleDashboardNavigation('SUPERVISOR').some(
        (item) => item.href === '/dashboard/collaborators',
      ),
    ).toBe(true);
  });

  it('permite subrotas de colaboradores para supervisor no escopo permitido', () => {
    expect(canAccessDashboardRoute('/dashboard/collaborators', 'SUPERVISOR')).toBe(true);
    expect(canAccessDashboardRoute('/dashboard/collaborators/new', 'SUPERVISOR')).toBe(true);
    expect(
      canAccessDashboardRoute('/dashboard/collaborators/supervisor-1', 'SUPERVISOR'),
    ).toBe(true);
  });

  it('mantem supervisor autorizado em modulos operacionais e relatorios', () => {
    expect(canAccessDashboardRoute('/dashboard', 'SUPERVISOR')).toBe(true);
    expect(canAccessDashboardRoute('/dashboard/reports', 'SUPERVISOR')).toBe(true);
    expect(canAccessDashboardRoute('/dashboard/sync-pendencies', 'SUPERVISOR')).toBe(true);
    expect(canAccessDashboardRoute('/dashboard/audit', 'SUPERVISOR')).toBe(true);
    expect(canAccessDashboardRoute('/dashboard/architecture', 'SUPERVISOR')).toBe(true);
    expect(canAccessDashboardRoute('/dashboard/visits/visit-1', 'SUPERVISOR')).toBe(true);
  });

  it('nega acesso a rotas de dashboard para promotor', () => {
    expect(canAccessDashboardRoute('/dashboard', 'PROMOTER')).toBe(false);
    expect(canAccessDashboardRoute('/dashboard/reports', 'PROMOTER')).toBe(false);
  });

  it('nega subrota de dashboard nao mapeada para evitar permissao implicita', () => {
    expect(canAccessDashboardRoute('/dashboard/unknown', 'ADMIN')).toBe(false);
  });
});
