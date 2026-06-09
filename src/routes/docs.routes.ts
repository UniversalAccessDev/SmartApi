import { Router } from 'express'
import { openapiSpec, docsHtml } from '../openapi'

const router = Router()

/** Machine-readable OpenAPI 3 spec. */
router.get('/openapi.json', (_req, res) => {
  res.json(openapiSpec)
})

/** Human-friendly interactive API docs (Redoc). */
router.get('/docs', (_req, res) => {
  res.type('html').send(docsHtml)
})

export default router
