import type { BaseLogger } from 'pino';
import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    logger: BaseLogger;
  }
}
