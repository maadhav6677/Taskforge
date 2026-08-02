import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../infrastructure/database/prisma.js';
import { toSuccessResponse } from '../../shared/http.js';
import { authenticate, requireRole } from '../auth/auth.middleware.js';
import { TaskRepository } from '../tasks/task.repository.js';
import { serializeTask } from '../tasks/task.routes.js';

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

export const createAdminRouter = () => {
  const router = Router();
  const tasks = new TaskRepository(prisma);
  router.use(authenticate, requireRole('ADMIN'));
  router.get('/dashboard/summary', async (req, res) => {
    const counts = await tasks.getStatusCounts();
    res.json(toSuccessResponse(req, { counts }));
  });
  router.get('/tasks', async (req, res) => {
    const query = paginationSchema.parse(req.query);
    const records = await tasks.listAll((query.page - 1) * query.pageSize, query.pageSize);
    res.json(toSuccessResponse(req, { tasks: records.map(serializeTask) }));
  });
  return router;
};
