import request from 'supertest';
import { createApp } from '../src/bootstrap/createApp.js';
import { disconnectDatabase } from '../src/infrastructure/database/prisma.js';
import { disconnectRedis } from '../src/infrastructure/redis/redis.js';
import { closeTaskQueue } from '../src/infrastructure/queue/task.queue.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('TaskForge API foundation', () => {
  afterAll(async () => {
    await Promise.all([closeTaskQueue(), disconnectRedis(), disconnectDatabase()]);
  });
  it('reports liveness with a correlated request ID', async () => {
    const response = await request(createApp()).get('/api/v1/health/live').expect(200);

    expect(response.body).toMatchObject({
      data: {
        status: 'alive',
        version: '0.1.0',
        dependencies: {
          redis: 'unchecked',
          postgres: 'unchecked',
          queue: 'unchecked',
        },
      },
    });
    expect(response.body.requestId).toMatch(uuidPattern);
    expect(response.headers['x-request-id']).toBe(response.body.requestId);
    expect(Number.isNaN(Date.parse(response.body.data.checkedAt))).toBe(false);
  });

  it('returns the public error envelope for an unknown route', async () => {
    const response = await request(createApp()).get('/api/v1/not-a-route').expect(404);

    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Cannot GET /api/v1/not-a-route',
      },
      requestId: response.body.requestId,
    });
    expect(response.body.requestId).toMatch(uuidPattern);
    expect(response.headers['x-request-id']).toBe(response.body.requestId);
    expect(response.body).not.toHaveProperty('stack');
  });

  it('rejects a state-changing request without an allowed origin and CSRF pair', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email: 'user@taskforge.local', password: 'TaskForge123!' })
      .expect(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });

  it('allows the configured browser origin without reflecting an untrusted origin', async () => {
    const trustedResponse = await request(createApp())
      .get('/api/v1/health/live')
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    expect(trustedResponse.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(trustedResponse.headers['access-control-allow-credentials']).toBe('true');

    const untrustedResponse = await request(createApp())
      .get('/api/v1/health/live')
      .set('Origin', 'https://untrusted.example');

    expect(untrustedResponse.status).toBeGreaterThanOrEqual(400);
    expect(untrustedResponse.headers['access-control-allow-origin']).toBeUndefined();
  });
});
