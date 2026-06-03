'use client';

import type { ReactNode } from 'react';

interface StatsCardProps {
  hint?: ReactNode;
  label: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  value: ReactNode;
}

export const StatsCard = ({ hint, label, tone = 'default', value }: StatsCardProps) => (
  <article className={`stats-card stats-card-${tone}`}>
    <span className="stats-card-label">{label}</span>
    <strong className="stats-card-value">{value}</strong>
    {hint ? <p className="stats-card-hint hint">{hint}</p> : null}
  </article>
);
