import { Router } from 'express';
import { prisma } from '../../infrastructure/database/prisma.js';
import { toSuccessResponse } from '../../shared/http.js';
import { authenticate, requireRole } from '../auth/auth.middleware.js';
import { TaskRepository } from '../tasks/task.repository.js';
import { redis } from '../../infrastructure/redis/redis.js';
import { TaskSummaryCache } from '../../infrastructure/cache/task-summary.cache.js';

export const createDashboardRouter = () => {
  const router = Router();
  const tasks = new TaskRepository(prisma);
  const cache = new TaskSummaryCache(redis);
  router.use(authenticate, requireRole('USER'));
  router.get('/summary', async (req, res) => {
    const counts = (await cache.get(req.auth!.sub)) ?? (await tasks.getStatusCounts(req.auth!.sub));
    await cache.set(counts, req.auth!.sub);
    res.json(toSuccessResponse(req, { counts }));
  });
  return router;
};
