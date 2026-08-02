import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import type { TaskforgeRedisClient } from '../../infrastructure/redis/redis.js';

interface StoredSession {
  userId: string;
  role: 'USER' | 'ADMIN';
  familyId: string;
  tokenHash: string;
}

export interface RefreshSession {
  token: string;
  sessionId: string;
  familyId: string;
  userId: string;
  role: 'USER' | 'ADMIN';
}

export class RefreshTokenInvalidError extends Error {}
export class RefreshTokenReuseError extends Error {}

const prefix = 'taskforge:auth:';
const sessionKey = (sessionId: string): string => `${prefix}session:${sessionId}`;
const usedKey = (sessionId: string): string => `${prefix}used:${sessionId}`;
const familyKey = (familyId: string): string => `${prefix}family:${familyId}`;

const rotationScript = `
local currentSession = redis.call('GET', KEYS[1])
local currentFamilySession = redis.call('GET', KEYS[2])
if not currentSession or currentSession ~= ARGV[1] then return 0 end
if not currentFamilySession or currentFamilySession ~= ARGV[2] then return -1 end
redis.call('DEL', KEYS[1])
redis.call('SET', KEYS[4], ARGV[3], 'EX', ARGV[6])
redis.call('SET', KEYS[3], ARGV[4], 'EX', ARGV[6])
redis.call('SET', KEYS[2], ARGV[5], 'EX', ARGV[6])
return 1
`;

const hashTokenSecret = (secret: string): string =>
  createHmac('sha256', env.JWT_REFRESH_SECRET).update(secret).digest('hex');

const hashesMatch = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const parseToken = (token: string): { sessionId: string; secret: string } => {
  const [sessionId, secret, extra] = token.split('.');
  if (
    !sessionId ||
    !secret ||
    extra ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      sessionId,
    )
  ) {
    throw new RefreshTokenInvalidError('Refresh token is invalid.');
  }
  return { sessionId, secret };
};

const createTokenMaterial = (session: Omit<StoredSession, 'tokenHash'>) => {
  const sessionId = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  const token = `${sessionId}.${secret}`;
  const stored: StoredSession = { ...session, tokenHash: hashTokenSecret(secret) };
  return { sessionId, token, stored };
};

export class RefreshSessionStore {
  public constructor(private readonly client: TaskforgeRedisClient) {}

  public async create(userId: string, role: 'USER' | 'ADMIN'): Promise<RefreshSession> {
    const familyId = randomUUID();
    const material = createTokenMaterial({ userId, role, familyId });
    const transaction = this.client.multi();
    transaction.set(
      sessionKey(material.sessionId),
      JSON.stringify(material.stored),
      'EX',
      env.JWT_REFRESH_TTL,
    );
    transaction.set(familyKey(familyId), material.sessionId, 'EX', env.JWT_REFRESH_TTL);
    await transaction.exec();
    return {
      token: material.token,
      sessionId: material.sessionId,
      userId,
      role,
      familyId,
    };
  }

  public async rotate(token: string): Promise<RefreshSession> {
    const { sessionId, secret } = parseToken(token);
    const serialized = await this.client.get(sessionKey(sessionId));

    if (!serialized) {
      const reusedFamilyId = await this.client.get(usedKey(sessionId));
      if (reusedFamilyId) {
        await this.revokeFamily(reusedFamilyId);
        throw new RefreshTokenReuseError('Refresh token reuse was detected.');
      }
      throw new RefreshTokenInvalidError('Refresh token is invalid or expired.');
    }

    const stored = JSON.parse(serialized) as StoredSession;
    if (!hashesMatch(stored.tokenHash, hashTokenSecret(secret))) {
      await this.revokeFamily(stored.familyId);
      throw new RefreshTokenReuseError('Refresh token reuse was detected.');
    }

    const next = createTokenMaterial({
      userId: stored.userId,
      role: stored.role,
      familyId: stored.familyId,
    });
    const result = await this.client.eval(
      rotationScript,
      4,
      sessionKey(sessionId),
      familyKey(stored.familyId),
      sessionKey(next.sessionId),
      usedKey(sessionId),
      serialized,
      sessionId,
      stored.familyId,
      JSON.stringify(next.stored),
      next.sessionId,
      String(env.JWT_REFRESH_TTL),
    );

    if (result !== 1) {
      await this.revokeFamily(stored.familyId);
      throw new RefreshTokenReuseError('Concurrent refresh token use was detected.');
    }

    return {
      token: next.token,
      sessionId: next.sessionId,
      userId: stored.userId,
      role: stored.role,
      familyId: stored.familyId,
    };
  }

  public async revoke(token: string): Promise<void> {
    try {
      const { sessionId, secret } = parseToken(token);
      const serialized = await this.client.get(sessionKey(sessionId));
      if (!serialized) return;
      const stored = JSON.parse(serialized) as StoredSession;
      if (hashesMatch(stored.tokenHash, hashTokenSecret(secret))) {
        await this.revokeFamily(stored.familyId);
      }
    } catch (error) {
      if (!(error instanceof RefreshTokenInvalidError)) throw error;
    }
  }

  private async revokeFamily(familyId: string): Promise<void> {
    const currentSessionId = await this.client.get(familyKey(familyId));
    const keys = [familyKey(familyId)];
    if (currentSessionId) keys.push(sessionKey(currentSessionId));
    await this.client.del(...keys);
  }
}
