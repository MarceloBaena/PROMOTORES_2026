export type RawEnvironment = Record<string, unknown>;

export const readString = (
  environment: RawEnvironment,
  key: string,
  fallback?: string,
) => {
  const value = environment[key];

  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Missing environment variable: ${key}`);
};

export const readNumber = (
  environment: RawEnvironment,
  key: string,
  fallback: number,
) => {
  const value = environment[key];

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);

    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

export const readPublicUrl = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim().length > 0 ? value : fallback;
