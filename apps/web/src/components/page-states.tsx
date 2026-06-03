'use client';

import { EmptyState as SharedEmptyState } from './ui/empty-state';

interface ErrorStateProps {
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export const LoadingState = ({ message }: { message: string }) => (
  <div className="loading-state">
    <strong>Carregando</strong>
    <p className="hint">{message}</p>
  </div>
);

export const EmptyState = ({ title, description }: { title: string; description?: string }) => (
  <SharedEmptyState title={title} description={description} />
);

export const ErrorState = ({
  message,
  retryLabel = 'Tentar novamente',
  onRetry,
}: ErrorStateProps) => (
  <div className="error-state">
    <strong>Falha no carregamento</strong>
    <p className="hint">{message}</p>
    {onRetry ? (
      <button className="button button-secondary" type="button" onClick={onRetry}>
        {retryLabel}
      </button>
    ) : null}
  </div>
);

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (nextPage: number) => void;
}

export const PaginationControls = ({ page, pageSize, total, onPageChange }: PaginationProps) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="pagination-row">
      <span className="hint">
        Pagina {page} de {totalPages} - {total} registros
      </span>
      <div className="pagination-actions">
        <button
          className="button button-secondary"
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </button>
        <button
          className="button button-secondary"
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Proxima
        </button>
      </div>
    </div>
  );
};
