import { startWorker } from './bootstrap/startWorker.js';
import { logger } from './infrastructure/logger.js';

void startWorker().catch((error: unknown) => {
  logger.fatal({ err: error }, 'TaskForge worker failed to start');
  process.exitCode = 1;
});
