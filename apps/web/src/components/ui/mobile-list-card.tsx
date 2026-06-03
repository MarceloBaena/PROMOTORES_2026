'use client';

import type { ReactNode } from 'react';

interface MobileListCardProps {
  actions?: ReactNode;
  children?: ReactNode;
  meta?: ReactNode;
  subtitle?: ReactNode;
  title: ReactNode;
}

export const MobileListCard = ({
  actions,
  children,
  meta,
  subtitle,
  title,
}: MobileListCardProps) => (
  <article className="mobile-list-card">
    <div className="mobile-list-card-header">
      <strong>{title}</strong>
      {meta ? <div className="mobile-list-card-meta">{meta}</div> : null}
    </div>
    {subtitle ? <p className="hint">{subtitle}</p> : null}
    {children ? <div className="mobile-list-card-body">{children}</div> : null}
    {actions ? <div className="row-actions">{actions}</div> : null}
  </article>
);
