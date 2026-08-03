import type { TaskStatus, TaskType } from '@taskforge/contracts';
import type { Prisma, Task, TaskEvent } from '../../generated/prisma/client.js';
import type { TaskforgePrismaClient } from '../../infrastructure/database/prisma.js';

export type JsonValue =
  boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface TaskRecord {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  type: TaskType;
  input: unknown;
  result: unknown | null;
  status: TaskStatus;
  errorCode: string | null;
  errorMessage: string | null;
  executionVersion: number;
  attemptsMade: number;
  maxAttempts: number;
  queueJobId: string | null;
  scheduledAt: Date | null;
  dispatchedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  version: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskEventRecord {
  id: bigint;
  taskId: string;
  type: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  executionVersion: number;
  attempt: number | null;
  metadata: unknown;
  occurredAt: Date;
}

export interface CreatePendingTaskInput {
  ownerId: string;
  title: string;
  description?: string;
  type: TaskType;
  input: JsonObject;
  scheduledAt?: Date;
  maxAttempts?: number;
}

export interface OwnedTaskListQuery {
  ownerId: string;
  search?: string;
  status?: TaskStatus;
  type?: TaskType;
  scheduled?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
  sortBy?: 'createdAt' | 'updatedAt' | 'scheduledAt' | 'status' | 'title';
  sortOrder?: 'asc' | 'desc';
  offset: number;
  limit: number;
}

export interface UpdatePendingTaskInput {
  title?: string;
  description?: string | null;
  input?: JsonObject;
  scheduledAt?: Date | null;
}

export interface TaskStatusCounts {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface TaskQueueJob {
  queueJobId: string;
}

export interface TaskQueueJobList {
  jobs: TaskQueueJob[];
  hasMore: boolean;
}

const toTaskRecord = (task: Task): TaskRecord => ({
  id: task.id,
  ownerId: task.ownerId,
  title: task.title,
  description: task.description,
  type: task.type,
  input: task.input,
  result: task.result,
  status: task.status,
  errorCode: task.errorCode,
  errorMessage: task.errorMessage,
  executionVersion: task.executionVersion,
  attemptsMade: task.attemptsMade,
  maxAttempts: task.maxAttempts,
  queueJobId: task.queueJobId,
  scheduledAt: task.scheduledAt,
  dispatchedAt: task.dispatchedAt,
  startedAt: task.startedAt,
  completedAt: task.completedAt,
  failedAt: task.failedAt,
  version: task.rowVersion,
  deletedAt: task.deletedAt,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
});

const toTaskEventRecord = (event: TaskEvent): TaskEventRecord => ({
  id: event.id,
  taskId: event.taskId,
  type: event.type,
  fromStatus: event.fromStatus,
  toStatus: event.toStatus,
  executionVersion: event.executionVersion,
  attempt: event.attempt,
  metadata: event.metadata,
  occurredAt: event.occurredAt,
});

const ownedTaskWhere = (
  query: Omit<OwnedTaskListQuery, 'offset' | 'limit' | 'sortBy' | 'sortOrder'>,
): Prisma.TaskWhereInput => {
  const search = query.search?.trim();
  return {
    ownerId: query.ownerId,
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.scheduled === undefined
      ? {}
      : { scheduledAt: query.scheduled ? { not: null } : null }),
    ...(query.createdFrom || query.createdTo
      ? {
          createdAt: {
            ...(query.createdFrom ? { gte: query.createdFrom } : {}),
            ...(query.createdTo ? { lte: query.createdTo } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
};

export class TaskRepository {
  public constructor(private readonly database: TaskforgePrismaClient) {}

  public async createPending(input: CreatePendingTaskInput): Promise<TaskRecord> {
    const task = await this.database.$transaction(async (transaction) => {
      const created = await transaction.task.create({
        data: {
          ownerId: input.ownerId,
          title: input.title.trim(),
          type: input.type,
          input: input.input,
          ...(input.description !== undefined ? { description: input.description.trim() } : {}),
          ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
          ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
        },
      });

      await transaction.taskEvent.create({
        data: {
          taskId: created.id,
          type: 'CREATED',
          toStatus: 'PENDING',
          executionVersion: created.executionVersion,
          metadata: {},
        },
      });

      return created;
    });

    return toTaskRecord(task);
  }

  public async findOwnedById(ownerId: string, taskId: string): Promise<TaskRecord | null> {
    const task = await this.database.task.findFirst({
      where: { id: taskId, ownerId, deletedAt: null },
    });
    return task ? toTaskRecord(task) : null;
  }

  public async listOwned(query: OwnedTaskListQuery): Promise<TaskRecord[]> {
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const primaryOrder: Prisma.TaskOrderByWithRelationInput = { [sortBy]: sortOrder };
    const tasks = await this.database.task.findMany({
      where: ownedTaskWhere(query),
      orderBy: [primaryOrder, { id: 'asc' }],
      skip: query.offset,
      take: query.limit,
    });

    return tasks.map(toTaskRecord);
  }

  public async countOwned(query: Omit<OwnedTaskListQuery, 'offset' | 'limit'>): Promise<number> {
    return this.database.task.count({
      where: ownedTaskWhere(query),
    });
  }

  public async getStatusCounts(ownerId?: string): Promise<TaskStatusCounts> {
    const groups = await this.database.task.groupBy({
      by: ['status'],
      where: { deletedAt: null, ...(ownerId ? { ownerId } : {}) },
      _count: { _all: true },
    });
    const byStatus = new Map(groups.map((group) => [group.status, group._count._all]));
    const pending = byStatus.get('PENDING') ?? 0;
    const processing = byStatus.get('PROCESSING') ?? 0;
    const completed = byStatus.get('COMPLETED') ?? 0;
    const failed = byStatus.get('FAILED') ?? 0;
    return {
      total: pending + processing + completed + failed,
      pending,
      processing,
      completed,
      failed,
    };
  }

  public async listQueueJobs(ownerId: string, limit: number): Promise<TaskQueueJobList> {
    const tasks = await this.database.task.findMany({
      where: {
        deletedAt: null,
        queueJobId: { not: null },
        status: { in: ['PENDING', 'PROCESSING'] },
        ownerId,
      },
      select: { queueJobId: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
    });

    return {
      jobs: tasks.slice(0, limit).flatMap(({ queueJobId }) => (queueJobId ? [{ queueJobId }] : [])),
      hasMore: tasks.length > limit,
    };
  }

  public async listAll(offset: number, limit: number): Promise<TaskRecord[]> {
    const tasks = await this.database.task.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: offset,
      take: limit,
    });
    return tasks.map(toTaskRecord);
  }

  public async listOwnedHistory(ownerId: string, taskId: string): Promise<TaskEventRecord[]> {
    const events = await this.database.taskEvent.findMany({
      where: {
        taskId,
        task: { ownerId, deletedAt: null },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });

    return events.map(toTaskEventRecord);
  }

  public async renamePending(
    ownerId: string,
    taskId: string,
    expectedVersion: number,
    title: string,
  ): Promise<TaskRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const update = await transaction.task.updateMany({
        where: {
          id: taskId,
          ownerId,
          rowVersion: expectedVersion,
          status: 'PENDING',
          deletedAt: null,
        },
        data: {
          title: title.trim(),
          rowVersion: { increment: 1 },
        },
      });

      if (update.count === 0) {
        return null;
      }

      const task = await transaction.task.findUniqueOrThrow({ where: { id: taskId } });
      await transaction.taskEvent.create({
        data: {
          taskId,
          type: 'UPDATED',
          executionVersion: task.executionVersion,
          metadata: { version: task.rowVersion },
        },
      });

      return toTaskRecord(task);
    });
  }

  public async updatePending(
    ownerId: string,
    taskId: string,
    expectedVersion: number,
    input: UpdatePendingTaskInput,
  ): Promise<TaskRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const update = await transaction.task.updateMany({
        where: {
          id: taskId,
          ownerId,
          rowVersion: expectedVersion,
          status: 'PENDING',
          deletedAt: null,
        },
        data: {
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description === null ? null : input.description.trim() }
            : {}),
          ...(input.input !== undefined ? { input: input.input } : {}),
          ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
          executionVersion: { increment: 1 },
          queueJobId: null,
          dispatchedAt: null,
          rowVersion: { increment: 1 },
        },
      });
      if (update.count === 0) return null;
      const task = await transaction.task.findUniqueOrThrow({ where: { id: taskId } });
      await transaction.taskEvent.create({
        data: {
          taskId,
          type: 'UPDATED',
          executionVersion: task.executionVersion,
          metadata: { version: task.rowVersion },
        },
      });
      return toTaskRecord(task);
    });
  }

  public async markDispatched(
    taskId: string,
    executionVersion: number,
    queueJobId: string,
    dispatchedAt: Date,
  ): Promise<boolean> {
    return this.database.$transaction(async (transaction) => {
      const update = await transaction.task.updateMany({
        where: {
          id: taskId,
          executionVersion,
          status: 'PENDING',
          dispatchedAt: null,
          deletedAt: null,
        },
        data: { queueJobId, dispatchedAt },
      });
      if (update.count === 0) return false;
      await transaction.taskEvent.create({
        data: {
          taskId,
          type: 'DISPATCHED',
          executionVersion,
          metadata: { queueJobId },
          occurredAt: dispatchedAt,
        },
      });
      return true;
    });
  }

  public async listDispatchCandidates(limit: number): Promise<TaskRecord[]> {
    const tasks = await this.database.task.findMany({
      where: { status: 'PENDING', deletedAt: null, dispatchedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return tasks.map(toTaskRecord);
  }

  public async softDeleteEligible(
    ownerId: string,
    taskId: string,
    expectedVersion: number,
    deletedAt: Date,
  ): Promise<boolean> {
    return this.database.$transaction(async (transaction) => {
      const update = await transaction.task.updateMany({
        where: {
          id: taskId,
          ownerId,
          rowVersion: expectedVersion,
          status: { in: ['PENDING', 'COMPLETED', 'FAILED'] },
          deletedAt: null,
        },
        data: {
          deletedAt,
          rowVersion: { increment: 1 },
        },
      });

      if (update.count === 0) {
        return false;
      }

      const task = await transaction.task.findUniqueOrThrow({ where: { id: taskId } });
      await transaction.taskEvent.create({
        data: {
          taskId,
          type: 'DELETED',
          executionVersion: task.executionVersion,
          metadata: { version: task.rowVersion },
          occurredAt: deletedAt,
        },
      });

      return true;
    });
  }

  public async claimPending(
    taskId: string,
    executionVersion: number,
    attempt: number,
    startedAt: Date,
  ): Promise<TaskRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const update = await transaction.task.updateMany({
        where: {
          id: taskId,
          executionVersion,
          status: 'PENDING',
          deletedAt: null,
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: startedAt } }],
        },
        data: {
          status: 'PROCESSING',
          attemptsMade: attempt,
          startedAt,
          rowVersion: { increment: 1 },
        },
      });

      if (update.count === 0) {
        return null;
      }

      await transaction.taskEvent.create({
        data: {
          taskId,
          type: 'STARTED',
          fromStatus: 'PENDING',
          toStatus: 'PROCESSING',
          executionVersion,
          attempt,
          metadata: {},
          occurredAt: startedAt,
        },
      });

      const task = await transaction.task.findUniqueOrThrow({ where: { id: taskId } });
      return toTaskRecord(task);
    });
  }

  public async completeProcessing(
    taskId: string,
    executionVersion: number,
    result: JsonObject,
    completedAt: Date,
  ): Promise<TaskRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const update = await transaction.task.updateMany({
        where: {
          id: taskId,
          executionVersion,
          status: 'PROCESSING',
          deletedAt: null,
        },
        data: {
          status: 'COMPLETED',
          result,
          completedAt,
          rowVersion: { increment: 1 },
        },
      });

      if (update.count === 0) {
        return null;
      }

      const task = await transaction.task.findUniqueOrThrow({ where: { id: taskId } });
      await transaction.taskEvent.create({
        data: {
          taskId,
          type: 'COMPLETED',
          fromStatus: 'PROCESSING',
          toStatus: 'COMPLETED',
          executionVersion,
          attempt: task.attemptsMade,
          metadata: {},
          occurredAt: completedAt,
        },
      });

      return toTaskRecord(task);
    });
  }

  public async recordProcessingFailure(
    taskId: string,
    executionVersion: number,
    attempt: number,
    retryable: boolean,
    errorCode: string,
    errorMessage: string,
    occurredAt: Date,
  ): Promise<TaskRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const update = await transaction.task.updateMany({
        where: { id: taskId, executionVersion, status: 'PROCESSING', deletedAt: null },
        data: retryable
          ? {
              status: 'PENDING',
              startedAt: null,
              errorCode: null,
              errorMessage: null,
              rowVersion: { increment: 1 },
            }
          : {
              status: 'FAILED',
              failedAt: occurredAt,
              errorCode,
              errorMessage,
              rowVersion: { increment: 1 },
            },
      });
      if (update.count === 0) return null;
      const task = await transaction.task.findUniqueOrThrow({ where: { id: taskId } });
      await transaction.taskEvent.create({
        data: {
          taskId,
          type: retryable ? 'RETRY_SCHEDULED' : 'FAILED',
          fromStatus: 'PROCESSING',
          toStatus: retryable ? 'PENDING' : 'FAILED',
          executionVersion,
          attempt,
          metadata: { errorCode },
          occurredAt,
        },
      });
      return toTaskRecord(task);
    });
  }

  public async manualRetry(
    ownerId: string,
    taskId: string,
    expectedVersion: number,
    occurredAt: Date,
  ): Promise<TaskRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const update = await transaction.task.updateMany({
        where: {
          id: taskId,
          ownerId,
          rowVersion: expectedVersion,
          status: 'FAILED',
          deletedAt: null,
        },
        data: {
          status: 'PENDING',
          executionVersion: { increment: 1 },
          attemptsMade: 0,
          queueJobId: null,
          dispatchedAt: null,
          startedAt: null,
          failedAt: null,
          errorCode: null,
          errorMessage: null,
          rowVersion: { increment: 1 },
        },
      });
      if (update.count === 0) return null;
      const task = await transaction.task.findUniqueOrThrow({ where: { id: taskId } });
      await transaction.taskEvent.create({
        data: {
          taskId,
          type: 'MANUAL_RETRY',
          fromStatus: 'FAILED',
          toStatus: 'PENDING',
          executionVersion: task.executionVersion,
          metadata: { version: task.rowVersion },
          occurredAt,
        },
      });
      return toTaskRecord(task);
    });
  }
}
