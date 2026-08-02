import type { Request, Response } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';

export const requestLogger = pinoHttp<Request, Response>({
  logger,
  customProps: (req: Request) => ({ requestId: req.requestId }),
  serializers: {
    req: (request: Request) => ({
      id: request.requestId,
      method: request.method,
      url: request.url,
    }),
    res: (response: Response) => ({ statusCode: response.statusCode }),
  },
});
