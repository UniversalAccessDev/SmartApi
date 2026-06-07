import { Router } from 'express'
import { teachSchema } from '../schemas/teach.schema'
import { learnSchema } from '../schemas/learn.schema'
import { teach, learn, getEntries, clearOrg } from '../kb/kb.service'
import { db } from '../kb/db'
import { asyncHandler } from '../middleware/asyncHandler'
import { MODEL_NAME } from '../constants'

const router = Router({ mergeParams: true })

const orgOf = (req: { params: Record<string, string> }): string =>
  req.params.org.trim().toLowerCase()

/** POST /api/v1/kb/:org/teach — teach phrase(s) -> locator for an org. */
router.post(
  '/:org/teach',
  asyncHandler(async (req, res) => {
    const parsed = teachSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        model: MODEL_NAME,
        error: 'ValidationError',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      })
      return
    }
    const result = teach(db, orgOf(req), parsed.data)
    res.json({ success: true, org: orgOf(req), ...result })
  }),
)

/** POST /api/v1/kb/:org/learn — bulk-ingest captured elements (recorder/harvester). */
router.post(
  '/:org/learn',
  asyncHandler(async (req, res) => {
    const parsed = learnSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        model: MODEL_NAME,
        error: 'ValidationError',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      })
      return
    }
    const result = learn(db, orgOf(req), parsed.data.elements)
    res.json({ success: true, org: orgOf(req), ...result })
  }),
)

/** GET /api/v1/kb/:org — inspect an org's learned vocabulary. */
router.get(
  '/:org',
  asyncHandler(async (req, res) => {
    const entries = getEntries(db, orgOf(req))
    res.json({ success: true, org: orgOf(req), count: entries.length, entries })
  }),
)

/** DELETE /api/v1/kb/:org — reset an org's KB. */
router.delete(
  '/:org',
  asyncHandler(async (req, res) => {
    const deleted = clearOrg(db, orgOf(req))
    res.json({ success: true, org: orgOf(req), deleted })
  }),
)

export default router
