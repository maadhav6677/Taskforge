import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../infrastructure/database/prisma.js';
import { redis } from '../../infrastructure/redis/redis.js';
import { HttpError, toSuccessResponse } from '../../shared/http.js';
import { UserRepository } from '../users/user.repository.js';
import {
  authCookieNames,
  clearAuthCookies,
  issueAuthCookies,
  issueCsrfCookie,
} from './auth.cookies.js';
import { authenticate } from './auth.middleware.js';
import {
  AuthService,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
} from './auth.service.js';
import {
  RefreshSessionStore,
  RefreshTokenInvalidError,
  RefreshTokenReuseError,
} from './refresh-session.store.js';
import { createRateLimit } from '../../infrastructure/rate-limit/rate-limit.middleware.js';

const credentialsSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(12).max(128),
  })
  .strict();

const toPublicUser = (user: { id: string; email: string; role: 'USER' | 'ADMIN' }) => ({
  id: user.id,
  email: user.email,
  role: user.role,
});

export const createAuthRouter = (
  service = new AuthService(new UserRepository(prisma), new RefreshSessionStore(redis)),
  users = new UserRepository(prisma),
) => {
  const router = Router();
  router.use(createRateLimit(redis, { name: 'auth', limit: 30, windowSeconds: 60 }));

  router.get('/csrf', (_req, res) => {
    issueCsrfCookie(res);
    res.status(204).end();
  });

  router.post('/register', async (req, res) => {
    const input = credentialsSchema.parse(req.body);
    try {
      const result = await service.register(input.email, input.password);
      await issueAuthCookies(res, result.session);
      res.status(201).json(toSuccessResponse(req, { user: toPublicUser(result.user) }));
    } catch (error) {
      if (error instanceof EmailAlreadyRegisteredError) {
        throw new HttpError(409, 'EMAIL_ALREADY_REGISTERED', 'The email is already registered.');
      }
      throw error;
    }
  });

  router.post('/login', async (req, res) => {
    const input = credentialsSchema.parse(req.body);
    try {
      const result = await service.login(input.email, input.password);
      await issueAuthCookies(res, result.session);
      res.json(toSuccessResponse(req, { user: toPublicUser(result.user) }));
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      }
      throw error;
    }
  });

  router.post('/refresh', async (req, res) => {
    const token = req.cookies[authCookieNames.refresh] as unknown;
    if (typeof token !== 'string') {
      clearAuthCookies(res);
      throw new HttpError(401, 'REFRESH_INVALID', 'The refresh session is invalid.');
    }
    try {
      const session = await service.refresh(token);
      await issueAuthCookies(res, session);
      res.json(toSuccessResponse(req, { refreshed: true }));
    } catch (error) {
      if (error instanceof RefreshTokenInvalidError || error instanceof RefreshTokenReuseError) {
        clearAuthCookies(res);
        throw new HttpError(401, 'REFRESH_INVALID', 'The refresh session is invalid.');
      }
      throw error;
    }
  });

  router.post('/logout', async (req, res) => {
    const token = req.cookies[authCookieNames.refresh] as unknown;
    await service.logout(typeof token === 'string' ? token : undefined);
    clearAuthCookies(res);
    res.status(204).end();
  });

  router.get('/me', authenticate, async (req, res) => {
    const user = await users.findById(req.auth!.sub);
    if (!user) throw new HttpError(401, 'AUTH_INVALID', 'The session is invalid.');
    res.json(toSuccessResponse(req, { user: toPublicUser(user) }));
  });

  return router;
};
