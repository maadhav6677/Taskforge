import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../infrastructure/database/prisma.js';
import { HttpError } from '../../shared/http.js';
import { authenticate, requireRole } from '../auth/auth.middleware.js';
import { FileRepository } from './file.repository.js';
import { FileStorage } from './file.storage.js';

const paramsSchema = z.object({ id: z.string().uuid() });

export const createFileRouter = () => {
  const router = Router();
  const files = new FileRepository(prisma);
  const storage = new FileStorage();
  router.use(authenticate, requireRole('USER'));
  router.get('/:id/download', async (req, res) => {
    const { id } = paramsSchema.parse(req.params);
    const file = await files.findOwnedById(req.auth!.sub, id);
    if (!file) throw new HttpError(404, 'FILE_NOT_FOUND', 'The file was not found.');
    const buffer = await storage.read(file.storageKey);
    const safeName = file.originalName.replace(/[\r\n"\\/]/g, '_');
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(buffer.length),
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    res.send(buffer);
  });
  return router;
};
