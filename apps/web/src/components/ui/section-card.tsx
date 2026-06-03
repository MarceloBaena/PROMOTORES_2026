'use client';

import type { ReactNode } from 'react';

interface SectionCardProps {
  actions?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  title?: ReactNode;
  tone?: 'default' | 'muted';
}

export const SectionCard = ({
  actions,
  children,
  description,
  title,
  tone = 'default',
}: SectionCardProps) => (
  <section
    className={
      tone === 'muted'
        ? 'section-card section-container section-card-muted'
        : 'section-card section-container'
    }
  >
    {title || description || actions ? (
      <div className="section-heading">
        <div className="section-heading-copy">
          {title ? <h2>{title}</h2> : null}
          {description ? <p className="hint">{description}</p> : null}
        </div>
        {actions ? <div className="row-actions">{actions}</div> : null}
      </div>
    ) : null}
    <div className="section-card-content section-container">{children}</div>
  </section>
);
