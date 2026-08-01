import { z } from 'zod';

export const taskStatusSchema = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskTypeSchema = z.enum(['TEXT_PROCESSING', 'FILE_INSPECTION']);
export type TaskType = z.infer<typeof taskTypeSchema>;

export const textTaskInputSchema = z.object({
  text: z.string().min(1).max(2000),
});

export const fileInspectionInputSchema = z.object({
  storageKey: z.string().uuid(),
  originalFileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(64),
  fileSizeBytes: z.number().int().positive(),
});

export const taskInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('TEXT_PROCESSING'),
    input: textTaskInputSchema,
  }),
  z.object({
    type: z.literal('FILE_INSPECTION'),
    input: fileInspectionInputSchema,
  }),
]);

export type TaskInput = z.infer<typeof taskInputSchema>;
export type TaskCreateInput = TaskInput & { title: string; description?: string };

export const apiSuccessEnvelopeSchema = z.object({
  data: z.unknown(),
  requestId: z.string().uuid(),
  meta: z.unknown().optional(),
});

export const apiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.array(z.unknown()).optional(),
  }),
  requestId: z.string().uuid(),
});

export interface ApiSuccessEnvelope<T = unknown> {
  data: T;
  requestId: string;
  meta?: unknown;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
  requestId: string;
}
