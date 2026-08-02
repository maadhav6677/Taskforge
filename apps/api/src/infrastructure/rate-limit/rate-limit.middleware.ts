import type { NextFunction, Request, Response } from 'express';
import type { TaskforgeRedisClient } from '../redis/redis.js';
import { HttpError } from '../../shared/http.js';

export const createRateLimit =
  (redis: TaskforgeRedisClient, options: { name: string; limit: number; windowSeconds: number }) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const identity = req.auth?.sub ?? req.ip ?? 'unknown';
    const bucket = Math.floor(Date.now() / (options.windowSeconds * 1_000));
    const key = `taskforge:limit:${options.name}:${identity}:${bucket}`;
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, options.windowSeconds + 1);
      if (count > options.limit) {
        next(new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.'));
        return;
      }
      next();
    } catch {
      next(new HttpError(503, 'SERVICE_UNAVAILABLE', 'The request cannot be processed right now.'));
    }
  };
