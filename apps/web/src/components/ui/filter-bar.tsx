'use client';

import type { ReactNode } from 'react';

interface FilterBarProps {
  actions?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  summary?: ReactNode;
  title?: ReactNode;
}

export const FilterBar = ({ actions, children, description, summary, title }: FilterBarProps) => (
  <div className="filter-bar">
    {title || description || summary ? (
      <div className="filter-bar-header">
        <div className="filter-bar-copy">
          {title ? <strong>{title}</strong> : null}
          {description ? <p className="hint">{description}</p> : null}
        </div>
        {summary ? <div className="filter-bar-summary">{summary}</div> : null}
      </div>
    ) : null}
    <div className="filter-bar-grid">{children}</div>
    {actions ? <div className="filter-bar-actions">{actions}</div> : null}
  </div>
);
