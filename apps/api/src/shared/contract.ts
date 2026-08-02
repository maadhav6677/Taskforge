import type { ApiErrorPayload, ApiSuccessResponse } from './http.js';

export interface ServiceDependencies {
  redis: 'unchecked' | 'ok' | 'down';
  postgres: 'unchecked' | 'ok' | 'down';
  queue: 'unchecked' | 'ok' | 'down';
}

export interface HealthPayload {
  status: 'alive';
  version: string;
  checkedAt: string;
  dependencies: ServiceDependencies;
}

export const healthSuccess = (
  requestId: string,
  dependencies: ServiceDependencies,
): ApiSuccessResponse<HealthPayload> => ({
  data: {
    status: 'alive',
    version: '0.1.0',
    checkedAt: new Date().toISOString(),
    dependencies,
  },
  requestId,
});

export const errorPayload = (
  code: string,
  message: string,
  details?: ApiErrorPayload['details'],
): ApiErrorPayload => ({ code, message, ...(details === undefined ? {} : { details }) });
