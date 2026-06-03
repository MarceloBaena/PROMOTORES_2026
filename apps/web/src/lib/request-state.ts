import { ApiError } from './api';

export const getRequestErrorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;

export const getSettledValue = <T>(result: PromiseSettledResult<T>) =>
  result.status === 'fulfilled' ? result.value : null;

export const getSettledErrorMessage = (
  result: PromiseSettledResult<unknown>,
  fallback: string,
) => (result.status === 'rejected' ? getRequestErrorMessage(result.reason, fallback) : null);
