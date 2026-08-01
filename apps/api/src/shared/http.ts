import { ZodError } from 'zod';
import type { NextFunction, Request, Response } from 'express';

export interface ApiSuccessResponse<TData> {
  data: TData;
  requestId: string;
  meta?: Record<string, unknown>;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown[];
}

export interface ApiErrorResponse {
  error: ApiErrorPayload;
  requestId: string;
}

export class HttpError extends Error {
  public readonly statusCode: number;

  public constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }

  public readonly code: string;
}

export const toSuccessResponse = <T>(
  req: Request,
  data: T,
  meta?: Record<string, unknown>,
): ApiSuccessResponse<T> => ({
  data,
  requestId: req.requestId,
  ...(meta ? { meta } : {}),
});

export const toErrorResponse = (
  req: Request,
  code: string,
  message: string,
  details?: unknown[],
): ApiErrorResponse => ({
  error: { code, message, ...(details ? { details } : {}) },
  requestId: req.requestId,
});

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json(
    toErrorResponse(
      req,
      'NOT_FOUND',
      `Cannot ${req.method} ${req.path}`,
    ),
  );
};

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const requestId = req.requestId ?? 'unknown';

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
      requestId,
    } satisfies ApiErrorResponse);
    return;
  }

  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Input validation failed.',
        details: error.issues,
      },
      requestId,
    } satisfies ApiErrorResponse);
    return;
  }

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
    requestId,
  } satisfies ApiErrorResponse);
};
