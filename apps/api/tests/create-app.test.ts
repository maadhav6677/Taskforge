import request from 'supertest';
import { createApp } from '../src/bootstrap/createApp.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('TaskForge API foundation', () => {
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

  it('does not report readiness before dependency checks are available', async () => {
    const response = await request(createApp()).get('/api/v1/health/ready').expect(503);

    expect(response.body).toEqual({
      error: {
        code: 'SERVICE_NOT_READY',
        message: 'The service is not ready to receive traffic.',
      },
      requestId: response.body.requestId,
    });
    expect(response.body.requestId).toMatch(uuidPattern);
    expect(response.headers['x-request-id']).toBe(response.body.requestId);
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
