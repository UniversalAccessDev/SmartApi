import { Router } from 'express'
import { generateSchema } from '../schemas/generate.schema'
import { generate } from '../services/generator.service'
import { asyncHandler } from '../middleware/asyncHandler'
import { MODEL_NAME, TAGLINE } from '../constants'

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
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
      return
    }

    const result = await generate(parsed.data)

    res.json({
      success: true,
      model: MODEL_NAME,
      tagline: TAGLINE,
      language: result.language,
      code: result.code,
      locatorStrategy: result.locatorStrategy,
      confidenceScore: result.confidenceScore,
      assumptions: result.assumptions,
      warnings: result.warnings,
      validation: result.validation,
      meta: result.meta,
    })
  }),
)

export default router
