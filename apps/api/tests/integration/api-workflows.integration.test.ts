import { rm } from 'node:fs/promises';
import request, { type Response } from 'supertest';
import { createApp } from '../../src/bootstrap/createApp.js';
import {
  connectDatabase,
  disconnectDatabase,
  prisma,
} from '../../src/infrastructure/database/prisma.js';
import { closeTaskQueue, getTaskQueue } from '../../src/infrastructure/queue/task.queue.js';
import { connectRedis, disconnectRedis, redis } from '../../src/infrastructure/redis/redis.js';

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
    const updated = await owner
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Origin', allowedOrigin)
      .set('x-csrf-token', csrf)
      .set('If-Match', '1')
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
      .set('If-Match', '2')
      .expect(204);
    await owner.get(`/api/v1/tasks/${taskId}`).expect(404);
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
