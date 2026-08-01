import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const requestId =
    (typeof req.headers[env.REQUEST_ID_HEADER] === 'string'
      ? req.headers[env.REQUEST_ID_HEADER]
      : req.headers[env.REQUEST_ID_HEADER.toLowerCase()]) ??
    randomUUID();

  req.requestId = requestId;
  res.setHeader(env.REQUEST_ID_HEADER, requestId);
  next();
};
