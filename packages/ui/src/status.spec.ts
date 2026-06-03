import { describe, expect, it } from 'vitest';
import { getVisitStatusLabel } from './status';

describe('status labels', () => {
  it('traduz status conhecidos', () => {
    expect(getVisitStatusLabel('COMPLETED')).toBe('Concluida');
    expect(getVisitStatusLabel('SYNC_PENDING')).toBe('Sync pendente');
  });

  it('mantem valor quando status nao estiver mapeado', () => {
    expect(getVisitStatusLabel('CUSTOM_STATUS')).toBe('CUSTOM_STATUS');
    expect(getVisitStatusLabel(undefined)).toBe('Nao informado');
  });
});
