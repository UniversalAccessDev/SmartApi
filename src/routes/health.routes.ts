import { Router } from 'express'
import { MODEL_NAME, PRODUCT_NAME } from '../constants'

const router = Router()

/** Liveness probe. */
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    service: PRODUCT_NAME,
    model: MODEL_NAME,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })
})

export default router
