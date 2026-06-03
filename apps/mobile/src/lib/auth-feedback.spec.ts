import { describe, expect, it } from 'vitest';
import { buildAuthFeedback, createAuthFeedback } from './auth-feedback';

const diagnostics = {
  configuredBaseUrl: 'https://api.example.com',
  activeBaseUrl: 'https://api.example.com',
  candidateBaseUrls: ['https://api.example.com'],
};

describe('auth feedback', () => {
  it('explica erro 401 de autenticacao', () => {
    const error = Object.assign(new Error('Credenciais invalidas'), {
      status: 401,
      details: {
        path: '/auth/login',
      },
    });
    const feedback = buildAuthFeedback(
      error,
      diagnostics,
    );

    expect(feedback.summary).toContain('Email ou senha');
    expect(feedback.details[0]).toContain('HTTP 401');
    expect(feedback.details.at(-1)).toContain('Ultima API usada');
  });

  it('explica falha de conexao com motivo tecnico', () => {
    const error = Object.assign(new Error('Falha de rede'), {
      status: 0,
      details: {
        reason: 'TIMEOUT',
        timeoutMs: 15000,
      },
    });
    const feedback = buildAuthFeedback(
      error,
      diagnostics,
    );

    expect(feedback.summary).toContain('Falha de conexao');
    expect(feedback.details[0]).toContain('Tempo limite');
  });

  it('cria feedback customizado mantendo diagnostico da API', () => {
    const feedback = createAuthFeedback('Campos obrigatorios faltando.', diagnostics, [
      'Preencha email e senha antes de continuar.',
    ]);

    expect(feedback.summary).toContain('Campos obrigatorios');
    expect(feedback.details).toContain('API configurada: https://api.example.com');
  });
});
