import { startApi } from './bootstrap/startApi.js';
import { logger } from './infrastructure/logger.js';

void startApi().catch((error: unknown) => {
  logger.fatal({ err: error }, 'TaskForge API failed to start');
  process.exitCode = 1;
});
