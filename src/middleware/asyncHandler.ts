import { NextFunction, Request, Response, RequestHandler } from 'express'

/**
 * Wrap an async route handler so any rejected promise is forwarded to the
 * Express error handler instead of crashing the process.
 */
export const asyncHandler =
  (
    handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
  ): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next)
  }
