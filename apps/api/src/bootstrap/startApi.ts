import type { Server } from 'node:http';
import { createApp } from './createApp.js';
import { env } from '../config/env.js';
import { logger } from '../infrastructure/logger.js';

export const startApi = async (): Promise<void> => {
  const app = createApp();
  const server: Server = app.listen(env.API_PORT, () => {
    logger.info(
      {
        port: env.API_PORT,
        basePath: env.API_BASE_PATH,
      },
      'TaskForge API started',
    );
  });

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
  };

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, 'Received shutdown signal for API');
    try {
      await close();
      logger.info('API shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'API shutdown failed');
      process.exit(1);
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
};
