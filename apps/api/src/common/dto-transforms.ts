import { Transform, type TransformFnParams } from 'class-transformer';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const lowercaseTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const uppercaseTrimmedString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

const digitsOnly = (value: unknown): unknown =>
  typeof value === 'string' ? value.replace(/\D/g, '') : value;

const parseBooleanValue = (value: unknown): unknown => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return value;
};

const parseTrimmedStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

export const toTrimmedString = Transform(({ value }: TransformFnParams) =>
  trimString(value),
);

export const toLowercaseTrimmedString = Transform(
  ({ value }: TransformFnParams) => lowercaseTrimmedString(value),
);

export const toUppercaseTrimmedString = Transform(
  ({ value }: TransformFnParams) => uppercaseTrimmedString(value),
);

export const toDigitsOnly = Transform(({ value }: TransformFnParams) =>
  digitsOnly(value),
);

export const toBooleanValue = Transform(({ value }: TransformFnParams) =>
  parseBooleanValue(value),
);

export const toTrimmedStringArray = Transform(({ value }: TransformFnParams) =>
  parseTrimmedStringArray(value),
);
