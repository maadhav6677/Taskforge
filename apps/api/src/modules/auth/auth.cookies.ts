import { randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { env } from '../../config/env.js';
import type { RefreshSession } from './refresh-session.store.js';
import { signAccessToken } from './access-token.js';

export const authCookieNames = {
  access: 'tf_access',
  refresh: 'tf_refresh',
  csrf: 'tf_csrf',
} as const;

const sharedOptions: CookieOptions = {
  secure: env.COOKIE_SECURE,
  sameSite: 'lax',
};

const accessOptions: CookieOptions = {
  ...sharedOptions,
  httpOnly: true,
  path: '/',
  maxAge: env.JWT_ACCESS_TTL * 1_000,
};

const refreshOptions: CookieOptions = {
  ...sharedOptions,
  httpOnly: true,
  path: `${env.API_BASE_PATH}/auth`,
  maxAge: env.JWT_REFRESH_TTL * 1_000,
};

const csrfOptions: CookieOptions = {
  ...sharedOptions,
  httpOnly: false,
  path: '/',
  maxAge: env.JWT_REFRESH_TTL * 1_000,
};

export const issueCsrfCookie = (res: Response): string => {
  const token = randomBytes(32).toString('base64url');
  res.cookie(authCookieNames.csrf, token, csrfOptions);
  return token;
};

export const issueAuthCookies = async (res: Response, session: RefreshSession): Promise<void> => {
  const accessToken = await signAccessToken({
    sub: session.userId,
    role: session.role,
    sid: session.sessionId,
  });
  res.cookie(authCookieNames.access, accessToken, accessOptions);
  res.cookie(authCookieNames.refresh, session.token, refreshOptions);
  issueCsrfCookie(res);
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie(authCookieNames.access, accessOptions);
  res.clearCookie(authCookieNames.refresh, refreshOptions);
  res.clearCookie(authCookieNames.csrf, csrfOptions);
};
