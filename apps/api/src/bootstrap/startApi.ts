import type { Server } from 'node:http';
import { createApp } from './createApp.js';
import { env } from '../config/env.js';
import { logger } from '../infrastructure/logger.js';
import { connectDatabase, disconnectDatabase } from '../infrastructure/database/prisma.js';
import { connectRedis, disconnectRedis } from '../infrastructure/redis/redis.js';
import { closeTaskQueue } from '../infrastructure/queue/task.queue.js';

export const startApi = async (): Promise<void> => {
  await connectDatabase();
  try {
    await connectRedis();
  } catch (error) {
    await disconnectDatabase();
    throw error;
  }
  const app = createApp();
  let server: Server;

  try {
    server = await new Promise<Server>((resolve, reject) => {
      const listeningServer = app.listen(env.API_PORT, (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(listeningServer);
      });
    });
  } catch (error) {
    await disconnectRedis();
    await disconnectDatabase();
    throw error;
  }

  logger.info(
    {
      port: env.API_PORT,
      basePath: env.API_BASE_PATH,
    },
    'TaskForge API started',
  );

  const close = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      }),
    );
    await Promise.all([closeTaskQueue(), disconnectRedis(), disconnectDatabase()]);
  };

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'Received shutdown signal for API');
    try {
      await close();
      logger.info('API shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'API shutdown failed');
      process.exit(1);
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
};
