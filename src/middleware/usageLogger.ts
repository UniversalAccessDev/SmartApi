import { NextFunction, Request, Response } from 'express'
import { KbDatabase } from '../kb/db'
import { recordUsage } from '../usage/usage.service'

/**
 * Records one usage_log row per request (method, path, org, status, latency, and
 * — for generate — step count + confidence). Skips /health so monitoring polls
 * don't drown out real usage. Best-effort: never affects the response.
 *
 * Routes may set `res.locals.usage = { steps, confidence }` to enrich the row.
 */
export const usageLogger =
  (db: KbDatabase) => (req: Request, res: Response, next: NextFunction) => {
    // Capture immutable values now — Express rewrites req.url/req.path while
    // routing, so reading them inside the 'finish' callback is unreliable.
    const path = req.originalUrl.split('?')[0]
    if (path === '/health') return next()
    const method = req.method
    const org = (req.header('x-org-id') ?? '').trim().toLowerCase() || null
    const start = Date.now()
    res.on('finish', () => {
      const extra = (res.locals?.usage ?? {}) as { steps?: number; confidence?: number }
      recordUsage(db, {
        ts: new Date().toISOString(),
        method,
        path,
        org,
        status: res.statusCode,
        durationMs: Date.now() - start,
        steps: extra.steps ?? null,
        confidence: extra.confidence ?? null,
      })
    })
    next()
  }
