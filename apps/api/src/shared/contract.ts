import type { ApiErrorPayload, ApiSuccessResponse } from './http';

export interface ServiceHealth {
  status: 'ok' | 'degraded';
  checkedAt: string;
  dependencies: {
    redis: 'unchecked' | 'ok' | 'down';
    postgres: 'unchecked' | 'ok' | 'down';
    queue: 'unchecked' | 'ok' | 'down';
  };
}

export interface HealthPayload {
  status: 'alive';
  version: string;
}

export const healthSuccess = (
  requestId: string,
  dependencies: ServiceHealth['dependencies'],
): ApiSuccessResponse<HealthPayload & ServiceHealth> => ({
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
): ApiErrorPayload => ({ code, message, details });
