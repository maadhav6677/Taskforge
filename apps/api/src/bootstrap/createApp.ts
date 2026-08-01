import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from '../config/env.js';
import { requestIdMiddleware } from '../infrastructure/request-id.js';
import { requestLogger } from '../infrastructure/request-logger.js';
import {
  createHealthRouter,
} from '../modules/health/health.routes.js';
import { errorHandler, notFoundHandler } from '../shared/http.js';

const parseAllowedOrigins = (origins: string): string[] =>
  origins
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const createApp = () => {
  const app = express();

  const allowedOrigins = parseAllowedOrigins(env.API_CORS_ORIGINS);

  app.use(requestIdMiddleware);
  app.use(requestLogger);
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('CORS not allowed'));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: env.API_MAX_JSON_BYTES }));
  app.use(express.urlencoded({ extended: false }));

  app.use(env.API_BASE_PATH, createHealthRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
