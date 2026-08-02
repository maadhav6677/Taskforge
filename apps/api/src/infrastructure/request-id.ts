import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const requestIdHeader = req.headers[env.REQUEST_ID_HEADER.toLowerCase()];
  const requestId = typeof requestIdHeader === 'string' ? requestIdHeader : randomUUID();

  req.requestId = requestId;
  res.setHeader(env.REQUEST_ID_HEADER, requestId);
  next();
};
