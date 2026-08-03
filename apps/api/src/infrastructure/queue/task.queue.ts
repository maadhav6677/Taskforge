import { Queue } from 'bullmq';
import { z } from 'zod';
import { env } from '../../config/env.js';

export const taskQueueName = 'taskforge-tasks';

export const taskJobSchema = z.object({
  taskId: z.string().uuid(),
  executionVersion: z.number().int().positive(),
});

export type TaskJob = z.infer<typeof taskJobSchema>;

export interface TaskQueueContext {
  waiting: number;
  delayed: number;
  active: number;
  available: boolean;
}

export const getBullConnection = () => {
  const url = new URL(env.REDIS_URL);
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    lazyConnect: true,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(Number.isInteger(database) ? { db: database } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
};

let singleton: Queue<TaskJob> | undefined;

export const getTaskQueue = (): Queue<TaskJob> => {
  singleton ??= new Queue<TaskJob>(taskQueueName, {
    connection: getBullConnection(),
    defaultJobOptions: {
      removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 2_000 },
    },
  });
  return singleton;
};

export const taskJobId = (taskId: string, executionVersion: number): string =>
  `${taskId}-${executionVersion}`;

export const getTaskQueueContext = async (
  jobIds?: readonly string[],
): Promise<TaskQueueContext> => {
  try {
    const queue = getTaskQueue();
    if (jobIds === undefined) {
      const counts = await queue.getJobCounts(
        'waiting',
        'waiting-children',
        'prioritized',
        'delayed',
        'active',
      );
      return {
        waiting: counts.waiting + counts['waiting-children'] + counts.prioritized,
        delayed: counts.delayed,
        active: counts.active,
        available: true,
      };
    }

    const states = await Promise.all(jobIds.map((jobId) => queue.getJobState(jobId)));
    return states.reduce<TaskQueueContext>(
      (context, state) => {
        if (state === 'delayed') context.delayed += 1;
        if (state === 'active') context.active += 1;
        if (state === 'waiting' || state === 'waiting-children' || state === 'prioritized') {
          context.waiting += 1;
        }
        return context;
      },
      { waiting: 0, delayed: 0, active: 0, available: true },
    );
  } catch {
    return { waiting: 0, delayed: 0, active: 0, available: false };
  }
};

export const closeTaskQueue = async (): Promise<void> => {
  if (!singleton) return;
  const queue = singleton;
  singleton = undefined;
  await queue.close();
};
