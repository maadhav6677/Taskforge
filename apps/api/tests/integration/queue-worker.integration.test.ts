import { createPrismaClient } from '../../src/infrastructure/database/prisma.js';
import {
  closeTaskQueue,
  getTaskQueue,
  taskJobId,
} from '../../src/infrastructure/queue/task.queue.js';
import { connectRedis, disconnectRedis, redis } from '../../src/infrastructure/redis/redis.js';
import { TaskDispatcher } from '../../src/modules/tasks/task.dispatcher.js';
import { TaskRepository } from '../../src/modules/tasks/task.repository.js';
import { createTaskWorker } from '../../src/modules/tasks/task.worker.js';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl) throw new Error('DATABASE_URL_TEST is required.');
const database = createPrismaClient(databaseUrl);
const tasks = new TaskRepository(database);

const waitFor = async <T>(read: () => Promise<T>, accept: (value: T) => boolean): Promise<T> => {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for asynchronous task state.');
};

describe('BullMQ worker lifecycle', () => {
  beforeAll(async () => {
    await database.$connect();
    await connectRedis();
  });

  beforeEach(async () => {
    await getTaskQueue().drain(true);
    await redis.flushdb();
    await database.$executeRawUnsafe(
      'TRUNCATE TABLE "file_attachments", "task_events", "tasks", "users" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await getTaskQueue().drain(true);
    await redis.flushdb();
    await Promise.all([closeTaskQueue(), disconnectRedis(), database.$disconnect()]);
  });

  it('executes one durable task and ignores duplicate current-version delivery', async () => {
    const worker = createTaskWorker(tasks);
    await worker.waitUntilReady();
    try {
      const owner = await database.user.create({
        data: { email: 'queue-owner@taskforge.local', passwordHash: 'integration-placeholder' },
      });
      const task = await tasks.createPending({
        ownerId: owner.id,
        title: 'Worker integration fixture',
        type: 'TEXT_PROCESSING',
        input: { schemaVersion: 1, text: 'one durable execution' },
      });
      const dispatcher = new TaskDispatcher(tasks);
      await Promise.all([dispatcher.dispatch(task), dispatcher.dispatch(task)]);

      const completed = await waitFor(
        () => tasks.findOwnedById(owner.id, task.id),
        (value) => value?.status === 'COMPLETED',
      );
      expect(completed).toMatchObject({ status: 'COMPLETED', attemptsMade: 1 });
      const history = await tasks.listOwnedHistory(owner.id, task.id);
      expect(history.filter(({ type }) => type === 'STARTED')).toHaveLength(1);
      expect(history.filter(({ type }) => type === 'COMPLETED')).toHaveLength(1);
    } finally {
      await worker.close();
    }
  });

  it('runs a delayed task no earlier than its scheduled time', async () => {
    const scheduledAt = new Date(Date.now() + 750);
    const task = await tasks.createPending({
      ownerId: (
        await database.user.create({
          data: {
            email: 'scheduled-owner@taskforge.local',
            passwordHash: 'integration-placeholder',
          },
        })
      ).id,
      title: 'Scheduled worker integration fixture',
      type: 'TEXT_PROCESSING',
      input: { schemaVersion: 1, text: 'run after the requested time' },
      scheduledAt,
    });
    const dispatcher = new TaskDispatcher(tasks);
    await dispatcher.dispatch(task);

    expect(await getTaskQueue().getJobState(taskJobId(task.id, task.executionVersion))).toBe(
      'delayed',
    );

    const worker = createTaskWorker(tasks);
    await worker.waitUntilReady();
    try {
      const completed = await waitFor(
        () => tasks.findOwnedById(task.ownerId, task.id),
        (value) => value?.status === 'COMPLETED',
      );
      expect(completed?.startedAt?.getTime()).toBeGreaterThanOrEqual(scheduledAt.getTime());
      expect(completed).toMatchObject({ status: 'COMPLETED', attemptsMade: 1 });
    } finally {
      await worker.close();
    }
  });

  it('records automatic retry transitions and completes the later BullMQ attempt', async () => {
    let executions = 0;
    const worker = createTaskWorker(tasks, {
      executeTextTask: () => {
        executions += 1;
        if (executions === 1) throw new Error('transient integration failure');
        return { schemaVersion: 1, normalized: 'retry completed' };
      },
    });
    await worker.waitUntilReady();
    try {
      const owner = await database.user.create({
        data: { email: 'retry-owner@taskforge.local', passwordHash: 'integration-placeholder' },
      });
      const task = await tasks.createPending({
        ownerId: owner.id,
        title: 'Automatic retry fixture',
        type: 'TEXT_PROCESSING',
        input: { schemaVersion: 1, text: 'retry through BullMQ' },
        maxAttempts: 2,
      });
      await new TaskDispatcher(tasks).dispatch(task);

      const completed = await waitFor(
        () => tasks.findOwnedById(owner.id, task.id),
        (value) => value?.status === 'COMPLETED',
      );
      const history = await tasks.listOwnedHistory(owner.id, task.id);

      expect(executions).toBe(2);
      expect(completed).toMatchObject({ status: 'COMPLETED', attemptsMade: 2 });
      expect(history.filter(({ type }) => type === 'STARTED')).toHaveLength(2);
      expect(history.filter(({ type }) => type === 'RETRY_SCHEDULED')).toHaveLength(1);
      expect(history.filter(({ type }) => type === 'COMPLETED')).toHaveLength(1);
    } finally {
      await worker.close();
    }
  });

  it('reconciles an undispatched durable task and executes it once', async () => {
    const worker = createTaskWorker(tasks);
    await worker.waitUntilReady();
    try {
      const owner = await database.user.create({
        data: { email: 'reconcile-owner@taskforge.local', passwordHash: 'integration-placeholder' },
      });
      const task = await tasks.createPending({
        ownerId: owner.id,
        title: 'Dispatch reconciliation fixture',
        type: 'TEXT_PROCESSING',
        input: { schemaVersion: 1, text: 'persist before queue recovery' },
      });
      const dispatcher = new TaskDispatcher(tasks);

      await expect(dispatcher.reconcile()).resolves.toBe(1);
      const completed = await waitFor(
        () => tasks.findOwnedById(owner.id, task.id),
        (value) => value?.status === 'COMPLETED',
      );
      const history = await tasks.listOwnedHistory(owner.id, task.id);

      expect(completed).toMatchObject({ status: 'COMPLETED', attemptsMade: 1 });
      expect(history.filter(({ type }) => type === 'DISPATCHED')).toHaveLength(1);
    } finally {
      await worker.close();
    }
  });
});
