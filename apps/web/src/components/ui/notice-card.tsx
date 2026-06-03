'use client';

import type { ReactNode } from 'react';

interface NoticeCardProps {
  description?: ReactNode;
  title: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}

export const NoticeCard = ({
  description,
  title,
  tone = 'neutral',
}: NoticeCardProps) => (
  <div className={`notice-card notice-card-${tone}`}>
    <strong className="notice-card-title">{title}</strong>
    {description ? <p className="notice-card-description hint">{description}</p> : null}
  </div>
);
