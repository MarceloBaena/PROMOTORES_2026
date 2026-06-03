'use client';

import type { ReactNode } from 'react';

interface EmptyStateProps {
  action?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}

export const EmptyState = ({ action, description, title }: EmptyStateProps) => (
  <div className="empty-state">
    <strong>{title}</strong>
    {description ? <p className="hint">{description}</p> : null}
    {action}
  </div>
);
