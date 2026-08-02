import { Redis } from 'ioredis';
import { env } from '../../config/env.js';

export const createRedisClient = (redisUrl: string) =>
  new Redis(redisUrl, {
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 1,
  });

export type TaskforgeRedisClient = ReturnType<typeof createRedisClient>;

export const redis = createRedisClient(env.REDIS_URL);

export const connectRedis = async (client: TaskforgeRedisClient = redis): Promise<void> => {
  if (client.status === 'wait') {
    await client.connect();
  }
  await client.ping();
};

export const disconnectRedis = async (client: TaskforgeRedisClient = redis): Promise<void> => {
  if (client.status === 'wait' || client.status === 'end') return;
  if (client.status === 'ready') {
    await client.quit();
    return;
  }
  client.disconnect();
};
