import { NextFunction, Request, Response } from 'express'
import { MODEL_NAME } from '../constants'

/** 404 handler for unknown routes. */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    model: MODEL_NAME,
    error: 'Not Found',
    code: 'NOT_FOUND',
    message: `No route matches ${req.method} ${req.originalUrl}`,
  })
}

/** Centralized error handler — returns a consistent JSON error envelope. */
export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  const message = err instanceof Error ? err.message : 'Unexpected error'
  console.error('[Smart API] Unhandled error:', err)

  res.status(500).json({
    success: false,
    model: MODEL_NAME,
    error: 'Internal Server Error',
    code: 'INTERNAL_ERROR',
    message,
  })
}
