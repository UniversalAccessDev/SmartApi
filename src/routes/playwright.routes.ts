import { Router } from 'express'
import { generateSchema } from '../schemas/generate.schema'
import { generate } from '../services/generator.service'
import { asyncHandler } from '../middleware/asyncHandler'
import { MODEL_NAME, TAGLINE } from '../constants'
import { db } from '../kb/db'
import { getEntries, makeResolver } from '../kb/kb.service'
import { recordWeakSteps } from '../usage/usage.service'

const router = Router()

/**
 * POST /api/v1/playwright/generate
 * Accepts plain-English QA steps and returns Playwright TypeScript code.
 */
router.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const parsed = generateSchema.safeParse(req.body)

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        model: MODEL_NAME,
        error: 'ValidationError',
        code: 'VALIDATION_ERROR',
        message: 'Request body failed validation; see issues for field-level details.',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
      return
    }

    // Org scope: when an X-Org-Id header is present, consult that org's KB first.
    const org = (req.header('x-org-id') ?? '').trim().toLowerCase()
    const resolveFromKb = org ? makeResolver(getEntries(db, org)) : undefined

    const result = await generate(parsed.data, { resolveFromKb })

    // Enrich the usage log for this call.
    res.locals.usage = { steps: parsed.data.steps.length, confidence: result.confidenceScore }
    // Diagnostics: log unmapped/weak steps so we can see what to fix per org.
    recordWeakSteps(db, org || null, result.meta.stepsAnalyzed)

    const outputFormat = parsed.data.outputFormat
    res.json({
      success: true,
      model: MODEL_NAME,
      tagline: TAGLINE,
      org: org || null,
      language: result.language,
      outputFormat,
      // "actions" -> structured action-JSON; "playwright" (default) -> code string.
      ...(outputFormat === 'actions' ? { actions: result.actions } : { code: result.code }),
      locatorStrategy: result.locatorStrategy,
      confidenceScore: result.confidenceScore,
      confidence: result.confidence,
      assumptions: result.assumptions,
      warnings: result.warnings,
      validation: result.validation,
      meta: result.meta,
    })
  }),
)

export default router
