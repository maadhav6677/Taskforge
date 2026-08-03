import { Router } from 'express';
import { prisma } from '../../infrastructure/database/prisma.js';
import { toSuccessResponse } from '../../shared/http.js';
import { authenticate, requireRole } from '../auth/auth.middleware.js';
import { TaskRepository } from '../tasks/task.repository.js';
import { redis } from '../../infrastructure/redis/redis.js';
import { TaskSummaryCache } from '../../infrastructure/cache/task-summary.cache.js';
import {
  getTaskQueueContext,
  scopedTaskQueueContextJobLimit,
} from '../../infrastructure/queue/task.queue.js';

export const createDashboardRouter = () => {
  const router = Router();
  const tasks = new TaskRepository(prisma);
  const cache = new TaskSummaryCache(redis);
  router.use(authenticate, requireRole('USER'));
  router.get('/summary', async (req, res) => {
    const [cachedCounts, queueJobs] = await Promise.all([
      cache.get(req.auth!.sub),
      tasks.listQueueJobs(req.auth!.sub, scopedTaskQueueContextJobLimit),
    ]);
    const counts = cachedCounts ?? (await tasks.getStatusCounts(req.auth!.sub));
    await cache.set(counts, req.auth!.sub);
    const queue = queueJobs.hasMore
      ? { waiting: 0, delayed: 0, active: 0, available: false }
      : await getTaskQueueContext(queueJobs.jobs.map(({ queueJobId }) => queueJobId));
    res.json(toSuccessResponse(req, { counts, queue }));
  });
  return router;
};
