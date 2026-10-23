import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { v4 as uuidv4 } from 'uuid';

/**
 * Attach a unique request ID to every request.
 */
export function requestId(req: Request, _res: Response, next: NextFunction): void {
  (req as any).requestId = uuidv4();
  next();
}

/**
 * Simple request logger.
 */
export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  const id = (req as any).requestId || '-';
  console.log(`[${id}] ${req.method} ${req.path}`);
  next();
}

/**
 * Centralized error handler.
 */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  const requestIdVal = (req as any).requestId || '-';

  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.flatten(),
        requestId: requestIdVal,
      },
    });
    return;
  }

  // Domain errors (thrown with a `code` property)
  if (err.code && err.statusCode) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId: requestIdVal,
      },
    });
    return;
  }

  // Unexpected errors
  console.error(`[${requestIdVal}] Unhandled error:`, err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId: requestIdVal,
    },
  });
}

/**
 * Custom domain error class.
 */
export class DomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, statusCode: number = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
