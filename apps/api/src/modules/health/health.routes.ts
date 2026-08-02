import { Router } from 'express';
import { healthSuccess } from '../../shared/contract.js';
import type { ServiceHealth } from '../../shared/contract.js';
import { toErrorResponse, toSuccessResponse } from '../../shared/http.js';
import type { Request, Response } from 'express';

const dependencyState: ServiceHealth['dependencies'] = {
  redis: 'unchecked',
  postgres: 'unchecked',
  queue: 'unchecked',
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

  router.get('/health/ready', (req: Request, res: Response) => {
    const apiReadyPayload = {
      status: 'ready',
      version: '0.1.0',
      checkedAt: new Date().toISOString(),
      dependencies: {
        ...dependencyState,
        redis: 'unchecked',
      },
    };

    res.status(200).json(toSuccessResponse(req, apiReadyPayload, { basePath: '/api/v1' }));
  });

  router.get('/docs', (req, res) => {
    res.status(200).json(
      toSuccessResponse(req, {
        message: 'OpenAPI generation is intentionally not started in Phase 1.',
      }),
    );
  });

  router.get('/openapi.json', (req, res) => {
    res
      .status(503)
      .json(
        toErrorResponse(
          req,
          'OPENAPI_NOT_AVAILABLE',
          'OpenAPI generation is intentionally not started in Phase 1.',
        ),
      );
  });

  return router;
};
