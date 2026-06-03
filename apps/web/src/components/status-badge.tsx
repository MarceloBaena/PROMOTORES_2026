'use client';

import type {
  OperationalVisitStatus,
  VisitCompletionStatus,
  VisitProgressStatus,
} from '@promotor/types';
import { formatStatusLabel, statusBadgeClassName } from '@/lib/format';

interface StatusBadgeProps {
  value?:
    | VisitProgressStatus
    | VisitCompletionStatus
    | OperationalVisitStatus
    | null;
}

export const StatusBadge = ({ value }: StatusBadgeProps) => (
  <span className={statusBadgeClassName(value)}>{formatStatusLabel(value)}</span>
);
