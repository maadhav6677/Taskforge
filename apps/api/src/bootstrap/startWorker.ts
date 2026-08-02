import { logger } from '../infrastructure/logger.js';
import { connectDatabase, disconnectDatabase } from '../infrastructure/database/prisma.js';
import { connectRedis, disconnectRedis } from '../infrastructure/redis/redis.js';
import { closeTaskQueue } from '../infrastructure/queue/task.queue.js';
import { prisma } from '../infrastructure/database/prisma.js';
import { TaskRepository } from '../modules/tasks/task.repository.js';
import { TaskDispatcher } from '../modules/tasks/task.dispatcher.js';
import { createTaskWorker, observeTaskWorker } from '../modules/tasks/task.worker.js';

export const startWorker = async (): Promise<void> => {
  await connectDatabase();
  try {
    await connectRedis();
  } catch (error) {
    await disconnectDatabase();
    throw error;
  }
  const worker = createTaskWorker();
  const dispatcher = new TaskDispatcher(new TaskRepository(prisma));
  try {
    await worker.waitUntilReady();
    await dispatcher.reconcile();
  } catch (error) {
    await worker.close().catch(() => undefined);
    await Promise.all([closeTaskQueue(), disconnectRedis(), disconnectDatabase()]);
    throw error;
  }
  observeTaskWorker(worker);
  logger.info('TaskForge worker process started');
  const reconciliation = setInterval(() => {
    void dispatcher
      .reconcile()
      .catch((error) => logger.error({ err: error }, 'Task dispatch reconciliation failed'));
  }, 15_000);

  const shutdown = async (signal: NodeJS.Signals) => {
    clearInterval(reconciliation);
    try {
      await worker.close();
      await Promise.all([closeTaskQueue(), disconnectRedis(), disconnectDatabase()]);
      logger.info({ signal }, 'Worker shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error, signal }, 'Worker shutdown failed');
      process.exit(1);
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
};
