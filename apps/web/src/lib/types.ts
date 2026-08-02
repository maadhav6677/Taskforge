export type Role = 'USER' | 'ADMIN';
export type TaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type TaskType = 'TEXT_PROCESSING' | 'FILE_INSPECTION';

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface Task {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  type: TaskType;
  input: unknown;
  result: unknown | null;
  status: TaskStatus;
  errorMessage: string | null;
  version: number;
  executionVersion: number;
  attemptsMade: number;
  maxAttempts: number;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskEvent {
  id: string;
  type: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  attempt: number | null;
  occurredAt: string;
}

export interface Attachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
}

export interface ApiEnvelope<T> {
  data: T;
  requestId: string;
  meta?: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
