/**
 * Dry analysis of QA steps — "improve your steps before you generate."
 *
 * Runs ONLY the rules engine (KB-first), then derives the same review signals
 * the generator uses, plus teach-mapping suggestions and human next-actions.
 * It never builds Playwright code, never runs Prettier, and never touches a
 * browser — so it is fast and side-effect free.
 */
import { runRulesEngine } from '../engine/rulesEngine'
import { AnalyzedStep, StepContext } from '../engine/types'
import { assessReview, ReviewReason, StepConfidence, REVIEW_CONFIDENCE_THRESHOLD } from './review.service'
import { normalize } from '../kb/kb.service'
import { AnalyzeInput } from '../schemas/analyze.schema'

/** A candidate phrase the caller should teach their org's KB (or rephrase). */
export interface TeachSuggestion {
  step: string
  normalized: string
  reason: 'unmapped' | 'low_confidence'
  confidence: number
  hint: string
  /** Where to send the mapping once they know the locator. */
  teachEndpoint: string
}

export interface AnalyzeResult {
  stepAnalysis: AnalyzedStep[]
  confidenceScore: number
  requiresReview: boolean
  reviewReasons: ReviewReason[]
  stepConfidence: StepConfidence[]
  assumptions: string[]
  warnings: string[]
  unmatchedSteps: string[]
  suggestedTeachMappings: TeachSuggestion[]
  recommendedNextActions: string[]
}

export interface AnalyzeOptions {
  resolveFromKb?: StepContext['resolveFromKb']
  /** Org slug, only used to make the teach endpoint hint concrete. */
  org?: string | null
}

const buildRecommendations = (
  review: ReviewReason[],
  teach: TeachSuggestion[],
): string[] => {
  const out: string[] = []
  const byCode = (c: string) => review.find((r) => r.code === c)

  const unmapped = byCode('unmapped_step')
  if (unmapped)
    out.push(
      `Teach the KB or rephrase ${unmapped.steps?.length ?? 0} unmapped step(s) so they map to an action.`,
    )

  const low = byCode('low_confidence')
  if (low)
    out.push(
      `Rephrase ${low.steps?.length ?? 0} low-confidence step(s) to name the field/element and its role.`,
    )

  const fallback = byCode('generic_fallback')
  if (fallback)
    out.push(
      `Name the target explicitly for ${fallback.steps?.length ?? 0} step(s) that fell back to a generic click.`,
    )

  const brittle = byCode('brittle_locator')
  if (brittle)
    out.push(
      `Replace inferred CSS/XPath with an accessible label or role for ${brittle.steps?.length ?? 0} step(s).`,
    )

  if (teach.length)
    out.push(`Use POST /api/v1/kb/:org/teach to map ${teach.length} phrase(s) to your app's locators.`)

  if (out.length === 0)
    out.push('All steps mapped cleanly with acceptable confidence — safe to generate.')

  return out
}

export function analyze(input: AnalyzeInput, options: AnalyzeOptions = {}): AnalyzeResult {
  const engine = runRulesEngine(input.steps, {
    closeOverlaysWithEscape: input.closeOverlaysWithEscape,
    resolveFromKb: options.resolveFromKb,
  })

  // Analyze never builds code, so review runs with an empty validation result;
  // its step-level signals (confidence, unmapped, fallback, brittle, risky) carry it.
  const review = assessReview(engine.analyzed, { valid: true, warnings: [] })

  const teachEndpoint = `POST /api/v1/kb/${options.org || ':org'}/teach`
  const suggestedTeachMappings: TeachSuggestion[] = engine.analyzed
    .filter((a) => a.rule === null || a.confidence < REVIEW_CONFIDENCE_THRESHOLD)
    .map((a) => ({
      step: a.step,
      normalized: normalize(a.step),
      reason: a.rule === null ? 'unmapped' : 'low_confidence',
      confidence: a.confidence,
      hint:
        a.rule === null
          ? 'Unmapped — teach this phrase a locator for your org, or rephrase to a known pattern.'
          : 'Low confidence — teach a precise locator, or rephrase to name the element and its role.',
      teachEndpoint,
    }))

  return {
    stepAnalysis: engine.analyzed,
    confidenceScore: engine.confidence,
    requiresReview: review.requiresReview,
    reviewReasons: review.reviewReasons,
    stepConfidence: review.stepConfidence,
    assumptions: engine.assumptions,
    warnings: engine.warnings,
    unmatchedSteps: engine.unmatchedSteps,
    suggestedTeachMappings,
    recommendedNextActions: buildRecommendations(review.reviewReasons, suggestedTeachMappings),
  }
}
