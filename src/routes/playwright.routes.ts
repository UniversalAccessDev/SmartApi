import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { generateSchema } from '../schemas/generate.schema'
import { analyzeSchema } from '../schemas/analyze.schema'
import { generate } from '../services/generator.service'
import { analyze } from '../services/analyze.service'
import { detectUnsafeCode } from '../services/validator.service'
import { asyncHandler } from '../middleware/asyncHandler'
import { MODEL_NAME, TAGLINE } from '../constants'
import { db } from '../kb/db'
import { getEntries, makeResolver } from '../kb/kb.service'
import { recordWeakSteps } from '../usage/usage.service'
import { SCHEMA_VERSION, validateActions } from '../contracts/actions'

const router = Router()

/** A per-request id (Phase 7 will move this to shared middleware). */
const requestId = (): string => `req_${randomUUID().replace(/-/g, '').slice(0, 24)}`

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

    // Hard safety gate: never return code containing dangerous patterns (eval,
    // Function, process, dynamic import, etc.). Generated code only uses the
    // escaped web-first API, so this can only trip on a smuggled injection.
    const unsafe = detectUnsafeCode(result.code)
    if (unsafe.length > 0) {
      res.status(422).json({
        success: false,
        error: 'GenerationFailed',
        code: 'UNSAFE_OUTPUT',
        message: `Refused to return generated code containing unsafe pattern(s): ${unsafe.join(', ')}.`,
      })
      return
    }

    // Enrich the usage log for this call.
    res.locals.usage = { steps: parsed.data.steps.length, confidence: result.confidenceScore }
    // Diagnostics: log unmapped/weak steps so we can see what to fix per org.
    recordWeakSteps(db, org || null, result.meta.stepsAnalyzed)

    const outputFormat = parsed.data.outputFormat

    // For action-JSON output, attach the contract version and run a self-check so
    // the engine can never ship malformed actions unnoticed.
    let actionsPayload: Record<string, unknown> = { code: result.code }
    if (outputFormat === 'actions') {
      const report = validateActions(result.actions)
      if (!report.ok) {
        result.warnings.push(
          `action-JSON self-check found ${report.issues.length} malformed action(s): ` +
            report.issues.map((i) => `[${i.index}] ${i.type} — ${i.message}`).join('; '),
        )
      }
      actionsPayload = {
        schemaVersion: SCHEMA_VERSION,
        actions: result.actions,
        ...(report.unknownTypes.length ? { unknownActionTypes: report.unknownTypes } : {}),
      }
    }

    res.json({
      success: true,
      model: MODEL_NAME,
      tagline: TAGLINE,
      org: org || null,
      language: result.language,
      outputFormat,
      // "actions" -> structured action-JSON (+ schemaVersion); "playwright" -> code.
      ...actionsPayload,
      locatorStrategy: result.locatorStrategy,
      confidenceScore: result.confidenceScore,
      confidence: result.confidence,
      requiresReview: result.requiresReview,
      reviewReasons: result.reviewReasons,
      stepConfidence: result.stepConfidence,
      assumptions: result.assumptions,
      warnings: result.warnings,
      validation: result.validation,
      meta: result.meta,
    })
  }),
)

/**
 * POST /api/v1/playwright/analyze
 * Dry analysis only — no code generation, no browser. Helps a caller improve
 * their steps (confidence, review flags, teach suggestions) before generating.
 */
router.post(
  '/analyze',
  asyncHandler(async (req, res) => {
    const rid = requestId()
    const parsed = analyzeSchema.safeParse(req.body)

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        requestId: rid,
        error: {
          code: 'ValidationError',
          message: 'Request body failed validation; see details for field-level issues.',
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      })
      return
    }

    const org = (req.header('x-org-id') ?? '').trim().toLowerCase()
    const resolveFromKb = org ? makeResolver(getEntries(db, org)) : undefined

    const result = analyze(parsed.data, { resolveFromKb, org: org || null })

    // Feed the unmapped/weak-step backlog from analysis too.
    res.locals.usage = { steps: parsed.data.steps.length, confidence: result.confidenceScore }
    recordWeakSteps(db, org || null, result.stepAnalysis)

    res.json({
      success: true,
      requestId: rid,
      orgId: org || null,
      testName: parsed.data.testName,
      url: parsed.data.url ?? null,
      stepAnalysis: result.stepAnalysis,
      confidenceScore: result.confidenceScore,
      requiresReview: result.requiresReview,
      reviewReasons: result.reviewReasons,
      assumptions: result.assumptions,
      warnings: result.warnings,
      unmatchedSteps: result.unmatchedSteps,
      suggestedTeachMappings: result.suggestedTeachMappings,
      recommendedNextActions: result.recommendedNextActions,
    })
  }),
)

export default router
