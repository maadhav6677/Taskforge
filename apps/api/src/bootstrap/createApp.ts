import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { env } from '../config/env.js';
import { requestIdMiddleware } from '../infrastructure/request-id.js';
import { requestLogger } from '../infrastructure/request-logger.js';
import { createHealthRouter } from '../modules/health/health.routes.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { requireCsrf } from '../modules/auth/auth.middleware.js';
import { createTaskRouter } from '../modules/tasks/task.routes.js';
import { createDashboardRouter } from '../modules/dashboard/dashboard.routes.js';
import { createAdminRouter } from '../modules/admin/admin.routes.js';
import { createFileRouter } from '../modules/files/file.routes.js';
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
        callback(null, false);
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: env.API_MAX_JSON_BYTES }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(requireCsrf);

  app.use(env.API_BASE_PATH, createHealthRouter());
  app.use(`${env.API_BASE_PATH}/auth`, createAuthRouter());
  app.use(`${env.API_BASE_PATH}/tasks`, createTaskRouter());
  app.use(`${env.API_BASE_PATH}/dashboard`, createDashboardRouter());
  app.use(`${env.API_BASE_PATH}/admin`, createAdminRouter());
  app.use(`${env.API_BASE_PATH}/files`, createFileRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
