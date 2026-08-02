import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { JsonObject } from './task.repository.js';

const inputSchema = z.object({ text: z.string().min(1).max(2_000) }).strict();

export class TextExecutionError extends Error {}

export const executeTextTask = (input: unknown): JsonObject => {
  const { text } = inputSchema.parse(input);
  if (text.includes('[[FAIL]]')) {
    throw new TextExecutionError('The requested deterministic failure was triggered.');
  }
  const normalized = text.trim().replace(/\s+/g, ' ');
  return {
    normalized,
    uppercase: normalized.toUpperCase(),
    wordCount: normalized ? normalized.split(' ').length : 0,
    characterCount: normalized.length,
    sha256: createHash('sha256').update(normalized).digest('hex'),
  };
};
