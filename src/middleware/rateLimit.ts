import { NextFunction, Request, Response } from 'express'
import crypto from 'crypto'

/**
 * Dependency-free fixed-window rate limiter for the key-protected API routes.
 *
 * Keyed by API key (hashed) when present, otherwise by client IP. In-memory and
 * per-instance — adequate for a single node / abuse-prevention; swap for a
 * shared store (Redis) if you scale horizontally and need a global limit.
 */
export interface RateLimitOptions {
  windowMs: number
  max: number
  /** Injectable clock for deterministic tests. */
  now?: () => number
}

interface Bucket {
  count: number
  resetAt: number
}

const hash = (s: string): string => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)

export const createRateLimiter = (opts: RateLimitOptions) => {
  const { windowMs, max } = opts
  const now = opts.now ?? Date.now
  const buckets = new Map<string, Bucket>()

  const idFor = (req: Request): string => {
    const key = req.header('x-api-key') || ''
    if (key) return `k:${hash(key)}` // hashed — never store raw keys
    return `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const t = now()
    const id = idFor(req)

    let bucket = buckets.get(id)
    if (!bucket || bucket.resetAt <= t) {
      bucket = { count: 0, resetAt: t + windowMs }
      buckets.set(id, bucket)
    }
    bucket.count += 1

    res.setHeader('X-RateLimit-Limit', String(max))
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)))
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - t) / 1000))
      res.setHeader('Retry-After', String(retryAfter))
      res.status(429).json({
        success: false,
        error: 'RateLimited',
        code: 'RATE_LIMITED',
        message: `Rate limit exceeded. Try again in ${retryAfter}s.`,
      })
      return
    }

    // Opportunistic cleanup so the map can't grow unbounded.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.resetAt <= t) buckets.delete(k)
    }

    next()
  }
}
