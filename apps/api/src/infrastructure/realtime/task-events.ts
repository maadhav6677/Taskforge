import { z } from 'zod';
import type { TaskforgeRedisClient } from '../redis/redis.js';

export const taskStatusChannel = 'taskforge:task-status';
export const taskStatusEventSchema = z.object({
  ownerId: z.string().uuid(),
  taskId: z.string().uuid(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']),
  executionVersion: z.number().int().positive(),
  occurredAt: z.string().datetime(),
});
export type TaskStatusEvent = z.infer<typeof taskStatusEventSchema>;

export const publishTaskStatus = async (
  redis: TaskforgeRedisClient,
  event: TaskStatusEvent,
): Promise<void> => {
  await redis.publish(taskStatusChannel, JSON.stringify(event));
};
