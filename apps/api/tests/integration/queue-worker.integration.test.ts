import { createPrismaClient } from '../../src/infrastructure/database/prisma.js';
import { closeTaskQueue } from '../../src/infrastructure/queue/task.queue.js';
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
  it('executes one durable task and ignores duplicate current-version delivery', async () => {
    await database.$connect();
    await connectRedis();
    await redis.flushdb();
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
        input: { text: 'one durable execution' },
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
      await redis.flushdb();
      await Promise.all([closeTaskQueue(), disconnectRedis(), database.$disconnect()]);
    }
  });
});
