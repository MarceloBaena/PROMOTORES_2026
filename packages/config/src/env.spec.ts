import { describe, expect, it } from 'vitest';
import { readNumber, readPublicUrl, readString } from './env';

describe('env helpers', () => {
  it('le string existente', () => {
    expect(readString({ SAMPLE: 'ok' }, 'SAMPLE')).toBe('ok');
  });

  it('usa fallback quando url publica nao vier definida', () => {
    expect(readPublicUrl('', 'http://localhost:3333/api')).toBe('http://localhost:3333/api');
  });

  it('converte numeros com fallback seguro', () => {
    expect(readNumber({ PORT: '3333' }, 'PORT', 3000)).toBe(3333);
    expect(readNumber({}, 'PORT', 3000)).toBe(3000);
  });
});
