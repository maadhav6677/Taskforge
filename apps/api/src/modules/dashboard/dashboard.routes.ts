import { Router } from 'express';
import { prisma } from '../../infrastructure/database/prisma.js';
import { toSuccessResponse } from '../../shared/http.js';
import { authenticate, requireRole } from '../auth/auth.middleware.js';
import { TaskRepository } from '../tasks/task.repository.js';

export const createDashboardRouter = () => {
  const router = Router();
  const tasks = new TaskRepository(prisma);
  router.use(authenticate, requireRole('USER'));
  router.get('/summary', async (req, res) => {
    const counts = await tasks.getStatusCounts(req.auth!.sub);
    res.json(toSuccessResponse(req, { counts }));
  });
  return router;
};
