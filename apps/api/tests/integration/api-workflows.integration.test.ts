import { rm } from 'node:fs/promises';
import request, { type Response } from 'supertest';
import { createApp } from '../../src/bootstrap/createApp.js';
import {
  connectDatabase,
  disconnectDatabase,
  prisma,
} from '../../src/infrastructure/database/prisma.js';
import {
  closeTaskQueue,
  getTaskQueue,
  scopedTaskQueueContextJobLimit,
} from '../../src/infrastructure/queue/task.queue.js';
import { connectRedis, disconnectRedis, redis } from '../../src/infrastructure/redis/redis.js';
import { createTaskWorker } from '../../src/modules/tasks/task.worker.js';

const app = createApp();
const allowedOrigin = 'http://localhost:3000';
const password = 'TaskForge123!';
type TestAgent = ReturnType<typeof request.agent>;

const csrfFrom = (response: Response): string => {
  const header = response.headers['set-cookie'] as string[] | string | undefined;
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  const value = cookies
    .map((cookie) => /(?:^|;\s*)tf_csrf=([^;]+)/.exec(cookie)?.[1])
    .find((token) => token !== undefined);
  if (!value) throw new Error('Expected the API to issue a CSRF cookie.');
  return decodeURIComponent(value);
};

const establishCsrf = async (agent: TestAgent): Promise<string> =>
  csrfFrom(await agent.get('/api/v1/auth/csrf').expect(204));

const register = async (email: string): Promise<TestAgent> => {
  const agent = request.agent(app);
  const csrf = await establishCsrf(agent);
  await agent
    .post('/api/v1/auth/register')
    .set('Origin', allowedOrigin)
    .set('x-csrf-token', csrf)
    .send({ email, password })
    .expect(201);
  return agent;
};

const waitFor = async <T>(read: () => Promise<T>, accept: (value: T) => boolean): Promise<T> => {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for asynchronous task state.');
};

beforeAll(async () => {
  await connectDatabase();
  await connectRedis();
});

beforeEach(async () => {
  await getTaskQueue().drain(true);
  await redis.flushdb();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "file_attachments", "task_events", "tasks", "users" RESTART IDENTITY CASCADE',
  );
  await rm('./tmp/test-uploads', { recursive: true, force: true });
});

afterAll(async () => {
  await getTaskQueue().drain(true);
  await rm('./tmp/test-uploads', { recursive: true, force: true });
  await Promise.all([closeTaskQueue(), disconnectRedis(), disconnectDatabase()]);
});

describe('authenticated API workflows', () => {
  it('reports readiness only after required dependencies respond', async () => {
    const response = await request(app).get('/api/v1/health/ready').expect(200);
    expect(response.body.data).toMatchObject({
      status: 'ready',
      dependencies: { postgres: 'ok', redis: 'ok', queue: 'ok' },
    });
  });

  it('registers a user, restores the cookie session, and rejects duplicate registration', async () => {
    const agent = await register('member@taskforge.local');

    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.data.user).toMatchObject({
      email: 'member@taskforge.local',
      role: 'USER',
    });
    expect(me.body).not.toHaveProperty('passwordHash');

    const csrf = await establishCsrf(agent);
    const duplicate = await agent
      .post('/api/v1/auth/register')
      .set('Origin', allowedOrigin)
      .set('x-csrf-token', csrf)
      .send({ email: 'MEMBER@taskforge.local', password })
      .expect(409);
    expect(duplicate.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('returns the same public login failure for an unknown email and a wrong password', async () => {
    await register('known@taskforge.local');

    const attempt = async (email: string, candidate: string) => {
      const agent = request.agent(app);
      const csrf = await establishCsrf(agent);
      return agent
        .post('/api/v1/auth/login')
        .set('Origin', allowedOrigin)
        .set('x-csrf-token', csrf)
        .send({ email, password: candidate })
        .expect(401);
    };

    const [unknown, incorrect] = await Promise.all([
      attempt('unknown@taskforge.local', password),
      attempt('known@taskforge.local', 'DefinitelyWrong123!'),
    ]);
    expect(unknown.body.error).toEqual(incorrect.body.error);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('enforces ownership, optimistic versions, and soft deletion through task routes', async () => {
    const owner = await register('owner@taskforge.local');
    const other = await register('other@taskforge.local');
    let csrf = await establishCsrf(owner);

    const created = await owner
      .post('/api/v1/tasks')
      .set('Origin', allowedOrigin)
      .set('x-csrf-token', csrf)
      .send({
        title: 'HTTP ownership fixture',
        type: 'TEXT_PROCESSING',
        input: { schemaVersion: 1, text: 'persist first and execute elsewhere' },
        maxAttempts: 3,
      })
      .expect(202);
    const taskId = created.body.data.task.id as string;

    await other.get(`/api/v1/tasks/${taskId}`).expect(404);
    csrf = await establishCsrf(owner);
    await owner
      .post('/api/v1/tasks')
      .set('Origin', allowedOrigin)
      .set('x-csrf-token', csrf)
      .send({
        title: 'Alphabetically first',
        type: 'TEXT_PROCESSING',
        input: { schemaVersion: 1, text: 'sort this list deterministically' },
      })
      .expect(202);

    const sorted = await owner
      .get('/api/v1/tasks?sortBy=title&sortOrder=asc&page=1&pageSize=10')
      .expect(200);
    expect(sorted.body.data.tasks.map((task: { title: string }) => task.title)).toEqual([
      'Alphabetically first',
      'HTTP ownership fixture',
    ]);
    await owner.get('/api/v1/tasks?sortBy=untrustedColumn').expect(422);

    const detail = await owner.get(`/api/v1/tasks/${taskId}`).expect(200);
    const detailEtag = detail.headers.etag as string | undefined;
    expect(detailEtag).toBeTruthy();
    csrf = await establishCsrf(owner);
    const updated = await owner
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Origin', allowedOrigin)
      .set('x-csrf-token', csrf)
      .set('If-Match', detailEtag!)
      .send({ title: 'Updated through the API' })
      .expect(200);
    expect(updated.body.data.task).toMatchObject({ title: 'Updated through the API', version: 2 });

    const staleCsrf = await establishCsrf(owner);
    const stale = await owner
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Origin', allowedOrigin)
      .set('x-csrf-token', staleCsrf)
      .set('If-Match', '1')
      .send({ title: 'Stale update' })
      .expect(409);
    expect(stale.body.error.code).toBe('TASK_VERSION_CONFLICT');

    csrf = await establishCsrf(owner);
    await owner
      .delete(`/api/v1/tasks/${taskId}`)
      .set('Origin', allowedOrigin)
      .set('x-csrf-token', csrf)
      .set('If-Match', updated.headers.etag as string)
      .expect(204);
    await owner.get(`/api/v1/tasks/${taskId}`).expect(404);
  });

  it('retries a failed task through the HTTP lifecycle with a new execution version', async () => {
    const worker = createTaskWorker();
    await worker.waitUntilReady();
    try {
      const owner = await register('retry-http@taskforge.local');
      const csrf = await establishCsrf(owner);
      const created = await owner
        .post('/api/v1/tasks')
        .set('Origin', allowedOrigin)
        .set('x-csrf-token', csrf)
        .send({
          title: 'Retry through HTTP',
          type: 'TEXT_PROCESSING',
          input: { schemaVersion: 1, text: '[[FAIL]]' },
          maxAttempts: 1,
        })
        .expect(202);
      const taskId = created.body.data.task.id as string;
      const readTask = async () =>
        (await owner.get(`/api/v1/tasks/${taskId}`).expect(200)).body.data.task;
      const failed = await waitFor(readTask, (task) => task.status === 'FAILED');

      const retryCsrf = await establishCsrf(owner);
      const retried = await owner
        .post(`/api/v1/tasks/${taskId}/retry`)
        .set('Origin', allowedOrigin)
        .set('x-csrf-token', retryCsrf)
        .set('If-Match', String(failed.version))
        .expect(202);
      expect(retried.body.data.task).toMatchObject({
        status: 'PENDING',
        executionVersion: 2,
        attemptsMade: 0,
      });

      const retriedFailure = await waitFor(
        readTask,
        (task) => task.status === 'FAILED' && task.executionVersion === 2,
      );
      const history = await owner.get(`/api/v1/tasks/${taskId}/history`).expect(200);

      expect(retriedFailure.attemptsMade).toBe(1);
      expect(history.body.data.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'MANUAL_RETRY', executionVersion: 2 }),
          expect.objectContaining({ type: 'FAILED', executionVersion: 2, attempt: 1 }),
        ]),
      );
    } finally {
      await worker.close();
    }
  });

  it('changes the task-detail ETag when a worker completes a task', async () => {
    const owner = await register('etag-worker-owner@taskforge.local');
    const csrf = await establishCsrf(owner);
    const created = await owner
      .post('/api/v1/tasks')
      .set('Origin', allowedOrigin)
      .set('x-csrf-token', csrf)
      .send({
        title: 'ETag completion fixture',
        type: 'TEXT_PROCESSING',
        input: { schemaVersion: 1, text: 'refresh the completed snapshot' },
      })
      .expect(202);
    const taskId = created.body.data.task.id as string;
    const pending = await owner.get(`/api/v1/tasks/${taskId}`).expect(200);
    const pendingEtag = pending.headers.etag as string | undefined;
    expect(pending.body.data.task).toMatchObject({ status: 'PENDING', result: null });
    expect(pendingEtag).toBeTruthy();

    const worker = createTaskWorker();
    await worker.waitUntilReady();
    try {
      await waitFor(
        async () => (await owner.get(`/api/v1/tasks/${taskId}`).expect(200)).body.data.task,
        (task) => task.status === 'COMPLETED',
      );
    } finally {
      await worker.close();
    }

    const completed = await owner
      .get(`/api/v1/tasks/${taskId}`)
      .set('If-None-Match', pendingEtag!)
      .expect(200);
    expect(completed.headers.etag).not.toBe(pendingEtag);
    expect(completed.body.data.task).toMatchObject({
      status: 'COMPLETED',
      attemptsMade: 1,
      result: expect.objectContaining({ normalized: 'refresh the completed snapshot' }),
    });
  });

  it('reports waiting, delayed, and active BullMQ context only for the signed-in user', async () => {
    const owner = await register('queue-context-owner@taskforge.local');
    const other = await register('queue-context-other@taskforge.local');
    const ownerCsrf = await establishCsrf(owner);
    const otherCsrf = await establishCsrf(other);
    const scheduledAt = new Date(Date.now() + 60_000).toISOString();

    await owner
      .post('/api/v1/tasks')
      .set('Origin', allowedOrigin)
      .set('x-csrf-token', ownerCsrf)
      .send({
        title: 'Waiting queue context',
        type: 'TEXT_PROCESSING',
        input: { schemaVersion: 1, text: 'waiting' },
      })
      .expect(202);
    const scheduledCsrf = await establishCsrf(owner);
    await owner
      .post('/api/v1/tasks')
      .set('Origin', allowedOrigin)
      .set('x-csrf-token', scheduledCsrf)
      .send({
        title: 'Delayed queue context',
        type: 'TEXT_PROCESSING',
        input: { schemaVersion: 1, text: 'delayed' },
        scheduledAt,
      })
      .expect(202);
    await other
      .post('/api/v1/tasks')
      .set('Origin', allowedOrigin)
      .set('x-csrf-token', otherCsrf)
      .send({
        title: 'Other user queue context',
        type: 'TEXT_PROCESSING',
        input: { schemaVersion: 1, text: 'not visible to owner' },
      })
      .expect(202);

    const summary = await owner.get('/api/v1/dashboard/summary').expect(200);
    expect(summary.body.data.queue).toEqual({
      waiting: 1,
      delayed: 1,
      active: 0,
      available: true,
    });
  });

  it('marks oversized scoped queue context unavailable instead of returning partial counts', async () => {
    const owner = await register('queue-context-limit@taskforge.local');
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'queue-context-limit@taskforge.local' },
    });
    const createdAt = new Date(Date.now() - 1_000);
    const dispatchedAt = new Date();
    await prisma.task.createMany({
      data: Array.from({ length: scopedTaskQueueContextJobLimit + 1 }, (_, index) => ({
        ownerId: user.id,
        title: `Scoped queue limit ${index}`,
        type: 'TEXT_PROCESSING',
        input: { schemaVersion: 1, text: 'bounded queue context' },
        queueJobId: `queue-context-limit-${index}`,
        createdAt,
        updatedAt: createdAt,
        dispatchedAt,
      })),
    });

    const summary = await owner.get('/api/v1/dashboard/summary').expect(200);
    expect(summary.body.data.counts).toMatchObject({
      total: scopedTaskQueueContextJobLimit + 1,
      pending: scopedTaskQueueContextJobLimit + 1,
    });
    expect(summary.body.data.queue).toEqual({
      waiting: 0,
      delayed: 0,
      active: 0,
      available: false,
    });
  });

  it('stores verified files privately and conceals downloads from other users', async () => {
    const owner = await register('file-owner@taskforge.local');
    const other = await register('file-other@taskforge.local');
    const csrf = await establishCsrf(owner);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );

    const created = await owner
      .post('/api/v1/tasks')
      .set('Origin', allowedOrigin)
      .set('x-csrf-token', csrf)
      .field(
        'task',
        JSON.stringify({
          title: 'Inspect a verified image',
          type: 'FILE_INSPECTION',
          input: { schemaVersion: 1 },
          maxAttempts: 2,
        }),
      )
      .attach('attachments', png, { filename: '../pixel.png', contentType: 'text/html' })
      .expect(202);
    const attachmentId = created.body.data.attachments[0].id as string;
    expect(created.body.data.attachments[0]).toMatchObject({ mimeType: 'image/png' });

    const detail = await owner.get(`/api/v1/tasks/${created.body.data.task.id}`).expect(200);
    expect(detail.body.data.attachments).toEqual([
      expect.objectContaining({
        id: attachmentId,
        originalName: 'pixel.png',
        mimeType: 'image/png',
      }),
    ]);
    expect(detail.body.data.attachments[0]).not.toHaveProperty('storageKey');

    const download = await owner.get(`/api/v1/files/${attachmentId}/download`).expect(200);
    expect(download.headers['content-type']).toMatch(/^image\/png/);
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    await other.get(`/api/v1/files/${attachmentId}/download`).expect(404);

    const invalidCsrf = await establishCsrf(owner);
    const invalid = await owner
      .post('/api/v1/tasks')
      .set('Origin', allowedOrigin)
      .set('x-csrf-token', invalidCsrf)
      .field(
        'task',
        JSON.stringify({
          title: 'Reject active content',
          type: 'FILE_INSPECTION',
          input: { schemaVersion: 1 },
        }),
      )
      .attach('attachments', Buffer.from('<html>unsafe</html>'), 'unsafe.png')
      .expect(422);
    expect(invalid.body.error.code).toBe('FILE_TYPE_UNSUPPORTED');
  });
});
