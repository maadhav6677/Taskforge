import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { healthSuccess } from '../../shared/contract.js';
import { toErrorResponse, toSuccessResponse } from '../../shared/http.js';
import type { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.js';
import { redis } from '../../infrastructure/redis/redis.js';
import { env } from '../../config/env.js';
import { openApiDocument } from '../../openapi/openapi.js';

const withTimeout = async <T>(operation: Promise<T>): Promise<T> => {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Dependency check timed out.')),
          env.API_HEALTH_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

export const createHealthRouter = () => {
  const router = Router();

  router.get('/health/live', (req: Request, res: Response) => {
    res.status(200).json({
      ...healthSuccess(req.requestId, {
        redis: 'unchecked',
        postgres: 'unchecked',
        queue: 'unchecked',
      }),
    });
  });

  router.get('/health/ready', async (req: Request, res: Response) => {
    const [postgres, redisCheck] = await Promise.allSettled([
      withTimeout(prisma.$queryRaw`SELECT 1`),
      withTimeout(redis.ping()),
    ]);
    if (postgres.status === 'fulfilled' && redisCheck.status === 'fulfilled') {
      res.json(
        toSuccessResponse(req, {
          status: 'ready',
          dependencies: { postgres: 'ok', redis: 'ok', queue: 'ok' },
        }),
      );
      return;
    }
    res
      .status(503)
      .json(
        toErrorResponse(req, 'SERVICE_NOT_READY', 'The service is not ready to receive traffic.'),
      );
  });

  router.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  router.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });

  return router;
};
