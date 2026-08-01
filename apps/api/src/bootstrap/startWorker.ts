import { logger } from '../infrastructure/logger.js';

export const startWorker = async (): Promise<void> => {
  logger.info('TaskForge worker process started');
  logger.info(
    'Phase 1 scope: worker shell up. Queue + task executors are introduced in later phases.',
  );

  const keepAlive = setInterval(() => {
    logger.debug('Worker heartbeat - phase 1 placeholder loop');
  }, 60_000);

  const shutdown = async (signal: NodeJS.Signals) => {
    clearInterval(keepAlive);
    logger.info({ signal }, 'Worker shutdown complete');
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
};
