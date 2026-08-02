import { createHash } from 'node:crypto';
import { textTaskInputSchema } from '@taskforge/contracts';
import type { JsonObject } from './task.repository.js';

export class TextExecutionError extends Error {}

export const executeTextTask = (input: unknown): JsonObject => {
  const { text } = textTaskInputSchema.parse(input);
  if (text.includes('[[FAIL]]')) {
    throw new TextExecutionError('The requested deterministic failure was triggered.');
  }
  const normalized = text.trim().replace(/\s+/g, ' ');
  return {
    schemaVersion: 1,
    normalized,
    uppercase: normalized.toUpperCase(),
    wordCount: normalized ? normalized.split(' ').length : 0,
    characterCount: normalized.length,
    sha256: createHash('sha256').update(normalized).digest('hex'),
  };
};
