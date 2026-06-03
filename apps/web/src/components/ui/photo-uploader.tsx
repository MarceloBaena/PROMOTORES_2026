'use client';

import type { ChangeEvent, ReactNode, RefObject } from 'react';
import { Camera } from 'lucide-react';
import { EmptyState } from './empty-state';
import { ActionBar } from './action-bar';
import { FormField } from './form-field';

interface PhotoUploaderOption<TValue extends string> {
  label: string;
  value: TValue;
}

interface PhotoUploaderProps<TValue extends string> {
  busy: boolean;
  category: TValue;
  countLabel?: string;
  disabled?: boolean;
  emptyDescription: string;
  emptyTitle?: string;
  footer?: ReactNode;
  hint: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onCategoryChange: (value: TValue) => void;
  onFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  optionLabel: string;
  options: ReadonlyArray<PhotoUploaderOption<TValue>>;
  preview: ReactNode;
  title: string;
}

export const PhotoUploader = <TValue extends string>({
  busy,
  category,
  countLabel,
  disabled = false,
  emptyDescription,
  emptyTitle = 'Nenhuma evidencia enviada',
  footer,
  hint,
  inputRef,
  onCategoryChange,
  onFileSelected,
  optionLabel,
  options,
  preview,
  title,
}: PhotoUploaderProps<TValue>) => (
  <div className="workspace-stage-card">
    <div className="workspace-stage-header">
      <div>
        <strong>{title}</strong>
        <p className="hint">{hint}</p>
      </div>
      {countLabel ? (
        <span className="info-chip">
          <Camera size={14} />
          {countLabel}
        </span>
      ) : null}
    </div>

    <div className="workspace-upload-grid">
      <FormField label={optionLabel}>
        <select
          className="select"
          value={category}
          onChange={(event) => onCategoryChange(event.target.value as TValue)}
          disabled={disabled || busy}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Camera ou galeria">
        <input
          ref={inputRef}
          className="input"
          type="file"
          accept="image/*"
          capture="environment"
          disabled={disabled || busy}
          onChange={onFileSelected}
        />
      </FormField>
    </div>

    {disabled ? <p className="hint">{emptyDescription}</p> : null}

    {preview ? (
      preview
    ) : (
      <EmptyState
        title={emptyTitle}
        description="Selecione uma foto pelo navegador para anexar a visita."
      />
    )}

    {footer ? <ActionBar>{footer}</ActionBar> : null}
  </div>
);
