import { NextFunction, Request, Response } from 'express'
import crypto from 'crypto'
import { env } from '../config/env'
import { MODEL_NAME } from '../constants'

/** Constant-time string comparison to avoid leaking key bytes via timing. */
const timingSafeMatch = (provided: string, expected: string): boolean => {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  // crypto.timingSafeEqual throws on length mismatch, so short-circuit first.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * Build an Express guard from a list of accepted API keys.
 * - If the list is empty, the guard is a no-op ("open mode") — useful for local
 *   development and tests.
 * - Otherwise, requests must send a matching key in the `x-api-key` header or
 *   they are rejected with 401.
 */
export const createApiKeyGuard = (keys: string[]) => {
  const accepted = keys.map((k) => k.trim()).filter(Boolean)
  const enabled = accepted.length > 0

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!enabled) {
      next()
      return
    }

    const provided = req.header('x-api-key') ?? ''
    const ok = provided.length > 0 && accepted.some((key) => timingSafeMatch(provided, key))

    if (!ok) {
      res.status(401).json({
        success: false,
        model: MODEL_NAME,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid API key. Send your key in the "x-api-key" request header.',
      })
      return
    }

    next()
  }
}

/** Accepted keys parsed from the environment (comma-separated API_KEYS). */
export const acceptedApiKeys = env.API_KEYS.split(',')
  .map((k) => k.trim())
  .filter(Boolean)

/** Whether API-key auth is currently active. */
export const apiKeyAuthEnabled = acceptedApiKeys.length > 0

/** The env-configured guard the app uses to protect the generate endpoint. */
export const requireApiKey = createApiKeyGuard(acceptedApiKeys)
