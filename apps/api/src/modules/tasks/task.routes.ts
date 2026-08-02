import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { env } from '../../config/env.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { HttpError, toSuccessResponse } from '../../shared/http.js';
import { authenticate, requireRole } from '../auth/auth.middleware.js';
import { FileRepository } from '../files/file.repository.js';
import { FileStorage, UnsupportedFileTypeError } from '../files/file.storage.js';
import { redis } from '../../infrastructure/redis/redis.js';
import { TaskSummaryCache } from '../../infrastructure/cache/task-summary.cache.js';
import { TaskDispatcher } from './task.dispatcher.js';
import type { TaskEventRecord, TaskRecord } from './task.repository.js';
import { TaskRepository } from './task.repository.js';
import {
  TaskNotFoundError,
  TaskService,
  TaskTransitionError,
  TaskVersionConflictError,
} from './task.service.js';

const taskIdSchema = z.object({ id: z.string().uuid() });
const taskStatuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
const textInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    text: z.string().min(1).max(2_000),
  })
  .strict();
const fileInspectionInputSchema = z.object({ schemaVersion: z.literal(1) }).strict();
const createSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        title: z.string().trim().min(1).max(160),
        description: z.string().trim().max(2_000).optional(),
        type: z.literal('TEXT_PROCESSING'),
        input: textInputSchema,
        scheduledAt: z.string().datetime({ offset: true }).optional(),
        maxAttempts: z.number().int().min(1).max(5).default(3),
      })
      .strict(),
    z
      .object({
        title: z.string().trim().min(1).max(160),
        description: z.string().trim().max(2_000).optional(),
        type: z.literal('FILE_INSPECTION'),
        input: fileInspectionInputSchema.default({ schemaVersion: 1 }),
        scheduledAt: z.string().datetime({ offset: true }).optional(),
        maxAttempts: z.number().int().min(1).max(5).default(3),
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (value.scheduledAt && new Date(value.scheduledAt).getTime() <= Date.now()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduledAt'],
        message: 'scheduledAt must be in the future.',
      });
    }
  });
const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    input: textInputSchema.optional(),
    scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.')
  .superRefine((value, context) => {
    if (value.scheduledAt && new Date(value.scheduledAt).getTime() <= Date.now()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduledAt'],
        message: 'scheduledAt must be in the future.',
      });
    }
  });
const listSchema = z
  .object({
    q: z.string().trim().max(160).optional(),
    status: z.enum(taskStatuses).optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(50).default(20),
  })
  .strict();

const parseExpectedVersion = (header: string | undefined): number => {
  const normalized = header?.replace(/^W\//, '').replaceAll('"', '');
  const version = Number(normalized);
  if (!normalized || !Number.isInteger(version) || version < 1) {
    throw new HttpError(400, 'IF_MATCH_REQUIRED', 'A valid If-Match version is required.');
  }
  return version;
};

const serializeTask = (task: TaskRecord) => ({
  ...task,
  createdAt: task.createdAt.toISOString(),
  updatedAt: task.updatedAt.toISOString(),
  scheduledAt: task.scheduledAt?.toISOString() ?? null,
  dispatchedAt: task.dispatchedAt?.toISOString() ?? null,
  startedAt: task.startedAt?.toISOString() ?? null,
  completedAt: task.completedAt?.toISOString() ?? null,
  failedAt: task.failedAt?.toISOString() ?? null,
  deletedAt: task.deletedAt?.toISOString() ?? null,
});

const serializeEvent = (event: TaskEventRecord) => ({
  ...event,
  id: event.id.toString(),
  occurredAt: event.occurredAt.toISOString(),
});

const translateTaskError = (error: unknown): never => {
  if (error instanceof TaskNotFoundError) {
    throw new HttpError(404, 'TASK_NOT_FOUND', 'The task was not found.');
  }
  if (error instanceof TaskVersionConflictError) {
    throw new HttpError(409, 'TASK_VERSION_CONFLICT', 'The task version is stale.');
  }
  if (error instanceof TaskTransitionError) {
    throw new HttpError(
      409,
      'TASK_INVALID_TRANSITION',
      'The task is not eligible for this action.',
    );
  }
  throw error;
};

export const createTaskRouter = () => {
  const router = Router();
  const repository = new TaskRepository(prisma);
  const service = new TaskService(repository, new TaskDispatcher(repository));
  const fileRepository = new FileRepository(prisma);
  const storage = new FileStorage();
  const summaryCache = new TaskSummaryCache(redis);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: env.TASK_MAX_FILES, fileSize: env.TASK_MAX_FILE_SIZE_BYTES },
  });
  router.use(authenticate, requireRole('USER'));

  router.post('/', upload.array('attachments', env.TASK_MAX_FILES), async (req, res) => {
    let body: unknown = req.body;
    if (typeof req.body.task === 'string') {
      try {
        body = JSON.parse(req.body.task) as unknown;
      } catch {
        throw new HttpError(400, 'INVALID_JSON', 'The multipart task field must be valid JSON.');
      }
    }
    const input = createSchema.parse(body);
    const uploadFiles = (req.files ?? []) as Express.Multer.File[];
    if (input.type === 'TEXT_PROCESSING' && uploadFiles.length > 0) {
      throw new HttpError(422, 'FILES_NOT_ALLOWED', 'Text tasks cannot include attachments.');
    }
    if (input.type === 'FILE_INSPECTION' && uploadFiles.length === 0) {
      throw new HttpError(
        422,
        'FILES_REQUIRED',
        'File inspection requires at least one attachment.',
      );
    }
    let verifiedFiles;
    try {
      verifiedFiles = await Promise.all(uploadFiles.map((file) => storage.verify(file)));
    } catch (error) {
      if (error instanceof UnsupportedFileTypeError) {
        throw new HttpError(422, 'FILE_TYPE_UNSUPPORTED', error.message);
      }
      throw error;
    }
    const task = await service.create(
      {
        ownerId: req.auth!.sub,
        title: input.title,
        type: input.type,
        input: input.input,
        maxAttempts: input.maxAttempts,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.scheduledAt ? { scheduledAt: new Date(input.scheduledAt) } : {}),
      },
      input.type === 'TEXT_PROCESSING',
    );
    await summaryCache.invalidate(req.auth!.sub);
    const storedKeys: string[] = [];
    const attachments = [];
    try {
      for (const verified of verifiedFiles) {
        const stored = await storage.save(verified);
        storedKeys.push(stored.storageKey);
        attachments.push(
          await fileRepository.create(task.id, {
            storageKey: stored.storageKey,
            originalName: stored.originalName,
            mimeType: stored.mimeType,
            sizeBytes: BigInt(stored.sizeBytes),
          }),
        );
      }
      if (input.type === 'FILE_INSPECTION') await service.dispatch(task);
    } catch (error) {
      await fileRepository.deleteForTask(task.id);
      await Promise.all(storedKeys.map((key) => storage.remove(key)));
      await repository.softDeleteEligible(req.auth!.sub, task.id, task.version, new Date());
      throw error;
    }
    res.status(202).json(
      toSuccessResponse(req, {
        task: serializeTask(task),
        attachments: attachments.map((file) => ({
          id: file.id,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: Number(file.sizeBytes),
        })),
      }),
    );
  });

  router.get('/', async (req, res) => {
    const query = listSchema.parse(req.query);
    const offset = (query.page - 1) * query.pageSize;
    const [tasks, totalItems] = await Promise.all([
      repository.listOwned({
        ownerId: req.auth!.sub,
        offset,
        limit: query.pageSize,
        ...(query.q ? { search: query.q } : {}),
        ...(query.status ? { status: query.status } : {}),
      }),
      repository.countOwned({
        ownerId: req.auth!.sub,
        ...(query.q ? { search: query.q } : {}),
        ...(query.status ? { status: query.status } : {}),
      }),
    ]);
    res.json(
      toSuccessResponse(
        req,
        { tasks: tasks.map(serializeTask) },
        {
          page: query.page,
          pageSize: query.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / query.pageSize),
        },
      ),
    );
  });

  router.get('/:id', async (req, res) => {
    const { id } = taskIdSchema.parse(req.params);
    const task = await repository.findOwnedById(req.auth!.sub, id);
    if (!task) throw new HttpError(404, 'TASK_NOT_FOUND', 'The task was not found.');
    const attachments = await fileRepository.listForTask(task.id);
    res.set('ETag', `"${task.version}"`).json(
      toSuccessResponse(req, {
        task: serializeTask(task),
        attachments: attachments.map((file) => ({
          id: file.id,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: Number(file.sizeBytes),
          sha256: file.sha256,
        })),
      }),
    );
  });

  router.patch('/:id', async (req, res) => {
    const { id } = taskIdSchema.parse(req.params);
    const input = updateSchema.parse(req.body);
    try {
      const task = await service.update(
        req.auth!.sub,
        id,
        parseExpectedVersion(req.get('if-match')),
        {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.input !== undefined ? { input: input.input } : {}),
          ...(input.scheduledAt !== undefined
            ? { scheduledAt: input.scheduledAt === null ? null : new Date(input.scheduledAt) }
            : {}),
        },
      );
      await summaryCache.invalidate(req.auth!.sub);
      res
        .set('ETag', `"${task.version}"`)
        .json(toSuccessResponse(req, { task: serializeTask(task) }));
    } catch (error) {
      translateTaskError(error);
    }
  });

  router.delete('/:id', async (req, res) => {
    const { id } = taskIdSchema.parse(req.params);
    try {
      await service.remove(req.auth!.sub, id, parseExpectedVersion(req.get('if-match')));
      await summaryCache.invalidate(req.auth!.sub);
      res.status(204).end();
    } catch (error) {
      translateTaskError(error);
    }
  });

  router.post('/:id/retry', async (req, res) => {
    const { id } = taskIdSchema.parse(req.params);
    try {
      const task = await service.retry(
        req.auth!.sub,
        id,
        parseExpectedVersion(req.get('if-match')),
      );
      await summaryCache.invalidate(req.auth!.sub);
      res.status(202).json(toSuccessResponse(req, { task: serializeTask(task) }));
    } catch (error) {
      translateTaskError(error);
    }
  });

  router.get('/:id/history', async (req, res) => {
    const { id } = taskIdSchema.parse(req.params);
    const task = await repository.findOwnedById(req.auth!.sub, id);
    if (!task) throw new HttpError(404, 'TASK_NOT_FOUND', 'The task was not found.');
    const events = await repository.listOwnedHistory(req.auth!.sub, id);
    res.json(toSuccessResponse(req, { events: events.map(serializeEvent) }));
  });

  return router;
};

export { serializeTask };
