import { logger } from '../../infrastructure/logger.js';
import type { TaskDispatcher } from './task.dispatcher.js';
import type {
  CreatePendingTaskInput,
  TaskRecord,
  TaskRepository,
  UpdatePendingTaskInput,
} from './task.repository.js';

export class TaskNotFoundError extends Error {}
export class TaskVersionConflictError extends Error {}
export class TaskTransitionError extends Error {}

export class TaskService {
  public constructor(
    private readonly tasks: TaskRepository,
    private readonly dispatcher: TaskDispatcher,
  ) {}

  public async create(input: CreatePendingTaskInput, dispatch = true): Promise<TaskRecord> {
    const task = await this.tasks.createPending(input);
    if (dispatch) await this.dispatchRecoverably(task);
    return task;
  }

  public async dispatch(task: TaskRecord): Promise<void> {
    await this.dispatchRecoverably(task);
  }

  public async update(
    ownerId: string,
    taskId: string,
    expectedVersion: number,
    input: UpdatePendingTaskInput,
  ): Promise<TaskRecord> {
    const current = await this.requireOwned(ownerId, taskId);
    this.requireVersion(current, expectedVersion);
    if (current.status !== 'PENDING') throw new TaskTransitionError();
    await this.dispatcher.remove(current);
    const updated = await this.tasks.updatePending(ownerId, taskId, expectedVersion, input);
    if (!updated) throw new TaskVersionConflictError();
    await this.dispatchRecoverably(updated);
    return updated;
  }

  public async remove(ownerId: string, taskId: string, expectedVersion: number): Promise<void> {
    const current = await this.requireOwned(ownerId, taskId);
    this.requireVersion(current, expectedVersion);
    if (current.status === 'PROCESSING') throw new TaskTransitionError();
    if (current.status === 'PENDING') await this.dispatcher.remove(current);
    const deleted = await this.tasks.softDeleteEligible(
      ownerId,
      taskId,
      expectedVersion,
      new Date(),
    );
    if (!deleted) throw new TaskVersionConflictError();
  }

  public async retry(
    ownerId: string,
    taskId: string,
    expectedVersion: number,
  ): Promise<TaskRecord> {
    const current = await this.requireOwned(ownerId, taskId);
    this.requireVersion(current, expectedVersion);
    if (current.status !== 'FAILED') throw new TaskTransitionError();
    const retried = await this.tasks.manualRetry(ownerId, taskId, expectedVersion, new Date());
    if (!retried) throw new TaskVersionConflictError();
    await this.dispatchRecoverably(retried);
    return retried;
  }

  private async requireOwned(ownerId: string, taskId: string): Promise<TaskRecord> {
    const task = await this.tasks.findOwnedById(ownerId, taskId);
    if (!task) throw new TaskNotFoundError();
    return task;
  }

  private requireVersion(task: TaskRecord, expectedVersion: number): void {
    if (task.version !== expectedVersion) throw new TaskVersionConflictError();
  }

  private async dispatchRecoverably(task: TaskRecord): Promise<void> {
    try {
      await this.dispatcher.dispatch(task);
    } catch (error) {
      logger.error(
        { err: error, taskId: task.id, executionVersion: task.executionVersion },
        'Task persisted but dispatch is pending reconciliation',
      );
    }
  }
}
