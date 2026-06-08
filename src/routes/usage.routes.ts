import { Router } from 'express'
import { getUsageSummary } from '../usage/usage.service'
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

export default router
