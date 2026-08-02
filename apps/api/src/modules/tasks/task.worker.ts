import { Worker, type Job } from 'bullmq';
import { prisma } from '../../infrastructure/database/prisma.js';
import {
  getBullConnection,
  taskJobSchema,
  taskQueueName,
  type TaskJob,
} from '../../infrastructure/queue/task.queue.js';
import { logger } from '../../infrastructure/logger.js';
import { TaskRepository } from './task.repository.js';
import { executeTextTask } from './text.executor.js';
import { FileRepository } from '../files/file.repository.js';
import { FileStorage } from '../files/file.storage.js';
import { redis } from '../../infrastructure/redis/redis.js';
import { TaskSummaryCache } from '../../infrastructure/cache/task-summary.cache.js';
import { publishTaskStatus } from '../../infrastructure/realtime/task-events.js';

const emitTaskStatus = async (
  ownerId: string,
  taskId: string,
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
  executionVersion: number,
): Promise<void> => {
  await Promise.allSettled([
    new TaskSummaryCache(redis).invalidate(ownerId),
    publishTaskStatus(redis, {
      ownerId,
      taskId,
      status,
      executionVersion,
      occurredAt: new Date().toISOString(),
    }),
  ]);
};

export const createTaskWorker = (tasks = new TaskRepository(prisma)) =>
  new Worker<TaskJob>(
    taskQueueName,
    async (job: Job<TaskJob>) => {
      const payload = taskJobSchema.parse(job.data);
      const attempt = job.attemptsMade + 1;
      const task = await tasks.claimPending(
        payload.taskId,
        payload.executionVersion,
        attempt,
        new Date(),
      );
      if (!task) return { skipped: true };
      await emitTaskStatus(task.ownerId, task.id, 'PROCESSING', task.executionVersion);

      try {
        let result;
        if (task.type === 'TEXT_PROCESSING') {
          result = executeTextTask(task.input);
        } else {
          const files = new FileRepository(prisma);
          const storage = new FileStorage();
          const attachments = await files.listForTask(task.id);
          const inspected = [];
          for (const attachment of attachments) {
            const sha256 = await storage.sha256(attachment.storageKey);
            await files.setSha256(attachment.id, sha256);
            inspected.push({
              id: attachment.id,
              mimeType: attachment.mimeType,
              sizeBytes: Number(attachment.sizeBytes),
              sha256,
            });
          }
          result = { schemaVersion: 1, files: inspected };
        }
        await tasks.completeProcessing(task.id, task.executionVersion, result, new Date());
        await emitTaskStatus(task.ownerId, task.id, 'COMPLETED', task.executionVersion);
        return result;
      } catch (error) {
        const retryable = attempt < task.maxAttempts;
        await tasks.recordProcessingFailure(
          task.id,
          task.executionVersion,
          attempt,
          retryable,
          'TASK_EXECUTION_FAILED',
          'Task execution failed.',
          new Date(),
        );
        await emitTaskStatus(
          task.ownerId,
          task.id,
          retryable ? 'PENDING' : 'FAILED',
          task.executionVersion,
        );
        throw error;
      }
    },
    { connection: getBullConnection(), concurrency: 5 },
  );

export const observeTaskWorker = (worker: Worker<TaskJob>): void => {
  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Task job completed'));
  worker.on('failed', (job, error) =>
    logger.warn({ jobId: job?.id, err: error }, 'Task job attempt failed'),
  );
  worker.on('error', (error) => logger.error({ err: error }, 'Task worker error'));
};
