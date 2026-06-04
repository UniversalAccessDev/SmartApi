import express, { Application } from 'express'
import cors from 'cors'
import healthRoutes from './routes/health.routes'
import playwrightRoutes from './routes/playwright.routes'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
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

  // Service descriptor — handy for humans hitting the root.
  app.get('/', (_req, res) => {
    res.json({
      name: PRODUCT_NAME,
      model: MODEL_NAME,
      tagline: TAGLINE,
      endpoints: {
        health: 'GET /health',
        generate: `POST ${API_PREFIX}/playwright/generate`,
      },
    })
  })

  app.use('/', healthRoutes)
  app.use(`${API_PREFIX}/playwright`, playwrightRoutes)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
