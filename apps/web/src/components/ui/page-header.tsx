'use client';

import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}

export const PageHeader = ({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: PageHeaderProps) => (
  <section className="page-header">
    <div className="page-header-copy">
      {eyebrow ? <span className="auth-kicker">{eyebrow}</span> : null}
      <h1 className="page-header-title">{title}</h1>
      {description ? <p className="page-header-description">{description}</p> : null}
      {meta ? <div className="page-header-meta page-header-meta-panel">{meta}</div> : null}
    </div>

    {actions ? <div className="page-header-actions">{actions}</div> : null}
  </section>
);
