import type { Queue } from 'bullmq';
import { taskJobId, taskQueue, type TaskJob } from '../../infrastructure/queue/task.queue.js';
import type { TaskRecord, TaskRepository } from './task.repository.js';

export class TaskDispatcher {
  public constructor(
    private readonly tasks: TaskRepository,
    private readonly queue: Queue<TaskJob> = taskQueue,
  ) {}

  public async dispatch(task: TaskRecord, now = new Date()): Promise<void> {
    const jobId = taskJobId(task.id, task.executionVersion);
    const delay = Math.max(0, (task.scheduledAt?.getTime() ?? now.getTime()) - now.getTime());
    await this.queue.add(
      'execute-task',
      { taskId: task.id, executionVersion: task.executionVersion },
      {
        jobId,
        delay,
        attempts: task.maxAttempts,
        backoff: { type: 'exponential', delay: 1_000 },
      },
    );
    await this.tasks.markDispatched(task.id, task.executionVersion, jobId, now);
  }

  public async remove(task: TaskRecord): Promise<void> {
    const job = await this.queue.getJob(taskJobId(task.id, task.executionVersion));
    if (job) await job.remove();
  }

  public async reconcile(limit = 100): Promise<number> {
    const candidates = await this.tasks.listDispatchCandidates(limit);
    for (const task of candidates) await this.dispatch(task);
    return candidates.length;
  }
}
