import type { TaskforgeRedisClient } from '../redis/redis.js';
import type { TaskStatusCounts } from '../../modules/tasks/task.repository.js';

const ownerKey = (ownerId: string): string => `taskforge:cache:dashboard:${ownerId}`;
const adminKey = 'taskforge:cache:dashboard:admin';

export class TaskSummaryCache {
  public constructor(private readonly redis: TaskforgeRedisClient) {}

  public async get(ownerId?: string): Promise<TaskStatusCounts | null> {
    try {
      const value = await this.redis.get(ownerId ? ownerKey(ownerId) : adminKey);
      return value ? (JSON.parse(value) as TaskStatusCounts) : null;
    } catch {
      return null;
    }
  }

  public async set(counts: TaskStatusCounts, ownerId?: string): Promise<void> {
    await this.redis
      .set(ownerId ? ownerKey(ownerId) : adminKey, JSON.stringify(counts), 'EX', 10)
      .catch(() => undefined);
  }

  public async invalidate(ownerId: string): Promise<void> {
    await this.redis.del(ownerKey(ownerId), adminKey).catch(() => undefined);
  }
}
