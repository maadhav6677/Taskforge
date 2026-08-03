import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../infrastructure/database/prisma.js';
import { toSuccessResponse } from '../../shared/http.js';
import { authenticate, requireRole } from '../auth/auth.middleware.js';
import { TaskRepository } from '../tasks/task.repository.js';
import { serializeTask } from '../tasks/task.routes.js';
import { redis } from '../../infrastructure/redis/redis.js';
import { TaskSummaryCache } from '../../infrastructure/cache/task-summary.cache.js';
import { getTaskQueueContext } from '../../infrastructure/queue/task.queue.js';

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

export const createAdminRouter = () => {
  const router = Router();
  const tasks = new TaskRepository(prisma);
  const cache = new TaskSummaryCache(redis);
  router.use(authenticate, requireRole('ADMIN'));
  router.get('/dashboard/summary', async (req, res) => {
    const counts = (await cache.get()) ?? (await tasks.getStatusCounts());
    await cache.set(counts);
    const queue = await getTaskQueueContext();
    res.json(toSuccessResponse(req, { counts, queue }));
  });
  router.get('/tasks', async (req, res) => {
    const query = paginationSchema.parse(req.query);
    const records = await tasks.listAll((query.page - 1) * query.pageSize, query.pageSize);
    res.json(toSuccessResponse(req, { tasks: records.map(serializeTask) }));
  });
  return router;
};
