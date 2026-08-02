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

      try {
        let result;
        if (task.type === 'TEXT_PROCESSING') {
          result = executeTextTask(task.input);
        } else {
          throw new Error('Unsupported task type for this worker phase.');
        }
        await tasks.completeProcessing(task.id, task.executionVersion, result, new Date());
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
