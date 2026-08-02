import { Queue } from 'bullmq';
import { z } from 'zod';
import { env } from '../../config/env.js';

export const taskQueueName = 'taskforge-tasks';

export const taskJobSchema = z.object({
  taskId: z.string().uuid(),
  executionVersion: z.number().int().positive(),
});

export type TaskJob = z.infer<typeof taskJobSchema>;

export const getBullConnection = () => {
  const url = new URL(env.REDIS_URL);
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(Number.isInteger(database) ? { db: database } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
};

export const taskQueue = new Queue<TaskJob>(taskQueueName, {
  connection: getBullConnection(),
  defaultJobOptions: {
    removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 2_000 },
  },
});

export const taskJobId = (taskId: string, executionVersion: number): string =>
  `${taskId}-${executionVersion}`;

export const closeTaskQueue = async (): Promise<void> => {
  await taskQueue.close();
};
