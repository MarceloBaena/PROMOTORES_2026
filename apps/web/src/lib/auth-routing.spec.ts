import { describe, expect, it } from 'vitest';
import { canAccessWebPortal, getDefaultRouteForRole } from './auth-routing';

describe('auth routing', () => {
  it('resolve a rota padrao por papel', () => {
    expect(getDefaultRouteForRole('ADMIN')).toBe('/dashboard');
    expect(getDefaultRouteForRole('SUPERVISOR')).toBe('/dashboard');
    expect(getDefaultRouteForRole('PROMOTER')).toBe('/workspace');
  });

  it('considera todos os papeis operacionais como autorizados no portal web', () => {
    expect(canAccessWebPortal('ADMIN')).toBe(true);
    expect(canAccessWebPortal('SUPERVISOR')).toBe(true);
    expect(canAccessWebPortal('PROMOTER')).toBe(true);
  });
});
