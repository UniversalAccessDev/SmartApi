import { Router } from 'express'
import { getUsageSummary, getUnmapped } from '../usage/usage.service'
import { db } from '../kb/db'
import { asyncHandler } from '../middleware/asyncHandler'

const router = Router()

/** GET /api/v1/usage — usage summary (totals, by endpoint/org/day, recent calls). */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, ...getUsageSummary(db) })
  }),
)

/**
 * GET /api/v1/usage/unmapped — phrasings that failed or mapped weakly, so we can
 * see exactly what to fix. Optional ?org=<id> and ?limit=<n>.
 */
router.get(
  '/unmapped',
  asyncHandler(async (req, res) => {
    const org = typeof req.query.org === 'string' ? req.query.org.toLowerCase() : undefined
    const limit = Number(req.query.limit) || undefined
    res.json({ success: true, ...getUnmapped(db, { org, limit }) })
  }),
)

export default router
