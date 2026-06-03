import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './format';

describe('format helpers', () => {
  it('retorna fallback seguro quando recebe datetime invalido', () => {
    expect(formatDateTime('horario-invalido')).toBe('Nao informado');
  });

  it('retorna fallback seguro quando recebe data invalida', () => {
    expect(formatDate('data-invalida')).toBe('Nao informado');
  });
});
