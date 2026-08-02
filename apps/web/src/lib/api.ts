import type { ApiEnvelope } from './types';

const origin = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4000';
const basePath = process.env.NEXT_PUBLIC_API_BASE_PATH ?? '/api/v1';
const apiBase = `${origin}${basePath}`;

export const apiAssetUrl = (path: string): string => `${apiBase}${path}`;

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const readCookie = (name: string): string | undefined =>
  document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');

const fetchCsrf = async (): Promise<string> => {
  await fetch(`${apiBase}/auth/csrf`, { credentials: 'include' });
  const token = readCookie('tf_csrf');
  if (!token) throw new ApiError(503, 'CSRF_UNAVAILABLE', 'Could not establish a secure session.');
  return decodeURIComponent(token);
};

let refreshPromise: Promise<boolean> | undefined;
const skipsRefreshRetry = (path: string): boolean =>
  ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'].includes(path);

const refreshSession = (): Promise<boolean> => {
  refreshPromise ??= (async () => {
    const csrf = readCookie('tf_csrf') ?? (await fetchCsrf());
    const response = await fetch(`${apiBase}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-csrf-token': decodeURIComponent(csrf) },
    });
    return response.ok;
  })().finally(() => {
    refreshPromise = undefined;
  });
  return refreshPromise;
};

export const apiRequest = async <T>(
  path: string,
  init: RequestInit = {},
  allowRefresh = true,
): Promise<ApiEnvelope<T>> => {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('x-csrf-token', readCookie('tf_csrf') ?? (await fetchCsrf()));
  }
  if (init.body && !(init.body instanceof FormData))
    headers.set('content-type', 'application/json');
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    method,
    headers,
    credentials: 'include',
  });
  if (response.status === 401 && allowRefresh && !skipsRefreshRetry(path)) {
    if (await refreshSession()) return apiRequest<T>(path, init, false);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      { error?: { code?: string; message?: string } } | undefined;
    throw new ApiError(
      response.status,
      payload?.error?.code ?? 'REQUEST_FAILED',
      payload?.error?.message ?? 'The request failed.',
    );
  }
  if (response.status === 204) return { data: undefined as T, requestId: '' };
  return (await response.json()) as ApiEnvelope<T>;
};
