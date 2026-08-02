import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { HttpError } from '../../shared/http.js';
import { authCookieNames } from './auth.cookies.js';
import { verifyAccessToken } from './access-token.js';

const allowedOrigins = env.API_CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const equalTokens = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

export const requireCsrf = (req: Request, _res: Response, next: NextFunction): void => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const origin = req.get('origin');
  const cookieToken = req.cookies[authCookieNames.csrf] as unknown;
  const headerToken = req.get(env.CSRF_HEADER);
  if (
    !origin ||
    !allowedOrigins.includes(origin) ||
    typeof cookieToken !== 'string' ||
    !headerToken ||
    !equalTokens(cookieToken, headerToken)
  ) {
    next(new HttpError(403, 'CSRF_INVALID', 'CSRF validation failed.'));
    return;
  }

  next();
};

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const accessToken = req.cookies[authCookieNames.access] as unknown;
  if (typeof accessToken !== 'string') {
    next(new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required.'));
    return;
  }

  try {
    req.auth = await verifyAccessToken(accessToken);
    next();
  } catch {
    next(new HttpError(401, 'AUTH_INVALID', 'The session is invalid or expired.'));
  }
};

export const requireRole =
  (role: 'USER' | 'ADMIN') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (req.auth?.role !== role) {
      next(new HttpError(403, 'FORBIDDEN', 'You are not allowed to access this resource.'));
      return;
    }
    next();
  };
