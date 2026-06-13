import express, { Application } from 'express'
import cors from 'cors'
import healthRoutes from './routes/health.routes'
import docsRoutes from './routes/docs.routes'
import playwrightRoutes from './routes/playwright.routes'
import kbRoutes from './routes/kb.routes'
import usageRoutes from './routes/usage.routes'
import { usageLogger } from './middleware/usageLogger'
import { db } from './kb/db'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import { requireApiKey, apiKeyAuthEnabled } from './middleware/apiKey'
import { createRateLimiter } from './middleware/rateLimit'
import { env } from './config/env'
import { API_PREFIX, MODEL_NAME, PRODUCT_NAME, TAGLINE } from './constants'

/**
 * Build and configure the Express application.
 * Separated from the server entrypoint so it can be imported in tests
 * without binding to a port.
 */
export const createApp = (): Application => {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '256kb' }))
  // Record usage (method/path/org/status/latency) for every request except /health.
  app.use(usageLogger(db))

  // Service descriptor — handy for humans hitting the root.
  app.get('/', (_req, res) => {
    res.json({
      name: PRODUCT_NAME,
      model: MODEL_NAME,
      tagline: TAGLINE,
      endpoints: {
        health: 'GET /health',
        docs: 'GET /docs',
        openapi: 'GET /openapi.json',
        generate: `POST ${API_PREFIX}/playwright/generate`,
        analyze: `POST ${API_PREFIX}/playwright/analyze`,
        usage: `GET ${API_PREFIX}/usage`,
      },
    })
  })

  app.use('/', healthRoutes)
  // Public API docs (OpenAPI JSON + Redoc) — no key required for discovery.
  app.use('/', docsRoutes)

  // Rate-limit + API-key guard for every protected route. /health and the root
  // descriptor stay public so monitoring and discovery keep working.
  const rateLimit = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
  })
  app.use(`${API_PREFIX}/playwright`, rateLimit, requireApiKey, playwrightRoutes)
  // Per-org knowledge base (teach + inspect), same protection.
  app.use(`${API_PREFIX}/kb`, rateLimit, requireApiKey, kbRoutes)
  // Usage summary (totals, by endpoint/org/day, recent), same protection.
  app.use(`${API_PREFIX}/usage`, rateLimit, requireApiKey, usageRoutes)

  app.use(notFoundHandler)
  app.use(errorHandler)

  if (!apiKeyAuthEnabled) {
    console.warn(
      '[Smart API] WARNING: API_KEYS is not set — the generate endpoint is OPEN to anyone. Set API_KEYS to require a key.',
    )
  }

  return app
}
