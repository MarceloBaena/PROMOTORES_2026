'use client';

import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  cancelDisabled?: boolean;
  confirmDisabled?: boolean;
  confirmLabel?: string;
  confirmTone?: 'danger' | 'primary';
  description: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: ReactNode;
}

export const ConfirmDialog = ({
  cancelDisabled = false,
  confirmDisabled = false,
  confirmLabel = 'Confirmar',
  confirmTone = 'danger',
  description,
  onCancel,
  onConfirm,
  open,
  title,
}: ConfirmDialogProps) => {
  if (!open) {
    return null;
  }

  return (
    <div aria-modal="true" className="confirm-dialog-backdrop" role="dialog">
      <div className="confirm-dialog">
        <div className="stack">
          <strong>{title}</strong>
          {typeof description === 'string' ? (
            <p className="hint">{description}</p>
          ) : (
            <div className="confirm-dialog-description">{description}</div>
          )}
        </div>
        <div className="row-actions">
          <button
            className="button button-secondary"
            type="button"
            disabled={cancelDisabled}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            className={`button ${confirmTone === 'primary' ? 'button-primary' : 'button-danger'}`}
            type="button"
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
