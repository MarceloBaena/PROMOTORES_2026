'use client';

import type { ReactNode } from 'react';

interface FormFieldProps {
  children: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  label: ReactNode;
  span?: 1 | 2;
}

export const FormField = ({
  children,
  error,
  hint,
  label,
  span = 1,
}: FormFieldProps) => (
  <label className={span === 2 ? 'label form-grid-span-2' : 'label'}>
    {label}
    {children}
    {hint ? <span className="hint">{hint}</span> : null}
    {error ? <span className="error-text">{error}</span> : null}
  </label>
);
