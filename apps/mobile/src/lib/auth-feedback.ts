import type { ApiDiagnostics } from './api';

export interface AuthFeedback {
  summary: string;
  details: string[];
}

type ApiErrorLike = Error & {
  status: number;
  details?: unknown;
};

const isApiErrorLike = (error: unknown): error is ApiErrorLike =>
  error instanceof Error &&
  'status' in error &&
  typeof (error as { status?: unknown }).status === 'number';

const appendApiDiagnostics = (details: string[], diagnostics: ApiDiagnostics) => {
  details.push(`API configurada: ${diagnostics.configuredBaseUrl}`);

  if (diagnostics.activeBaseUrl) {
    details.push(`Ultima API usada: ${diagnostics.activeBaseUrl}`);
  }
};

const resolveReasonLabel = (reason: unknown) => {
  if (!reason) {
    return null;
  }

  if (typeof reason === 'string') {
    return reason;
  }

  if (typeof reason === 'object' && reason !== null) {
    if ('reason' in reason && typeof reason.reason === 'string') {
      if (reason.reason === 'TIMEOUT') {
        return 'Tempo limite da API excedido';
      }

      return reason.reason;
    }

    if ('message' in reason && typeof reason.message === 'string') {
      return reason.message;
    }
  }

  return null;
};

export const createAuthFeedback = (
  summary: string,
  diagnostics: ApiDiagnostics,
  details: string[] = [],
): AuthFeedback => {
  const mergedDetails = [...details];
  appendApiDiagnostics(mergedDetails, diagnostics);

  return {
    summary,
    details: mergedDetails,
  };
};

export const buildAuthFeedback = (
  error: unknown,
  diagnostics: ApiDiagnostics,
): AuthFeedback => {
  if (isApiErrorLike(error)) {
    if (error.status === 0) {
      const details: string[] = [];
      const reason = resolveReasonLabel(error.details);

      details.push(
        reason
          ? `Motivo tecnico: ${reason}`
          : 'Motivo tecnico: a API nao respondeu ou a conexao foi interrompida.',
      );
      details.push('Confirme se a URL da API esta ativa e se o aparelho tem acesso a ela.');

      return createAuthFeedback('Falha de conexao com a API do sistema.', diagnostics, details);
    }

    if (error.status === 401) {
      const details = [
        `HTTP 401 retornado pela API: ${error.message}`,
        'Isso normalmente indica senha incorreta, usuario inativo ou sessao invalida.',
      ];

      return createAuthFeedback(
        'Email ou senha nao foram aceitos para este acesso.',
        diagnostics,
        details,
      );
    }

    if (error.status === 403) {
      return createAuthFeedback(
        'O usuario autenticou, mas nao tem permissao para usar o app do promotor.',
        diagnostics,
        [`HTTP 403 retornado pela API: ${error.message}`],
      );
    }

    if (error.status >= 500) {
      return createAuthFeedback(
        'A API apresentou falha interna ao processar o login.',
        diagnostics,
        [`HTTP ${error.status} retornado pela API: ${error.message}`],
      );
    }

    return createAuthFeedback(
      'Nao foi possivel concluir o login.',
      diagnostics,
      [`HTTP ${error.status} retornado pela API: ${error.message}`],
    );
  }

  if (error instanceof Error) {
    return createAuthFeedback('Nao foi possivel concluir o login.', diagnostics, [
      `Motivo tecnico: ${error.message}`,
    ]);
  }

  return createAuthFeedback('Nao foi possivel concluir o login.', diagnostics, [
    'Motivo tecnico: erro desconhecido no fluxo de autenticacao.',
  ]);
};
