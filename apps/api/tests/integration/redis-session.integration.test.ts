import { createRedisClient } from '../../src/infrastructure/redis/redis.js';
import {
  RefreshSessionStore,
  RefreshTokenInvalidError,
  RefreshTokenReuseError,
} from '../../src/modules/auth/refresh-session.store.js';

const redisUrl = process.env.REDIS_URL_TEST;
if (!redisUrl || new URL(redisUrl).pathname !== '/15') {
  throw new Error('REDIS_URL_TEST must use the isolated Redis database 15.');
}
const client = createRedisClient(redisUrl);
const sessions = new RefreshSessionStore(client);

beforeAll(async () => {
  await client.connect();
});
beforeEach(async () => {
  await client.flushdb();
});
afterAll(async () => {
  await client.flushdb();
  await client.quit();
});

describe('Redis refresh session rotation', () => {
  it('rotates a session once and revokes the family when the replaced token is reused', async () => {
    const initial = await sessions.create('11111111-1111-4111-8111-111111111111', 'USER');
    const rotated = await sessions.rotate(initial.token);

    expect(rotated.token).not.toBe(initial.token);
    await expect(sessions.rotate(initial.token)).rejects.toBeInstanceOf(RefreshTokenReuseError);
    await expect(sessions.rotate(rotated.token)).rejects.toBeInstanceOf(RefreshTokenInvalidError);
  });

  it('allows only one winner when refresh requests race', async () => {
    const initial = await sessions.create('11111111-1111-4111-8111-111111111111', 'USER');
    const outcomes = await Promise.allSettled([
      sessions.rotate(initial.token),
      sessions.rotate(initial.token),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
  });
});
