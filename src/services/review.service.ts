/**
 * Review signals — turn the engine's per-step analysis into an actionable
 * "should a human look at this before running it?" verdict.
 *
 * Pure and deterministic: derived entirely from the engine output + the static
 * validation result, so it is trivially testable and adds no new dependencies.
 */
import { AnalyzedStep, LocatorStrategy } from '../engine/types'
import { ValidationResult } from './validator.service'

/** Below this per-step confidence, a step is flagged for review. */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.6

/** Per-step confidence + the inputs a reviewer needs to judge it. */
export interface StepConfidence {
  /** The normalized/expanded step as it was translated. */
  step: string
  rule: string | null
  confidence: number
  level: 'high' | 'medium' | 'low'
  strategy: LocatorStrategy | null
  assumptions: string[]
  warnings: string[]
}

export type ReviewReasonCode =
  | 'low_confidence'
  | 'unmapped_step'
  | 'generic_fallback'
  | 'brittle_locator'
  | 'risky_assumption'
  | 'validation_warning'

export interface ReviewReason {
  code: ReviewReasonCode
  message: string
  /** Indexes into `stepConfidence`, when the reason is step-specific. */
  steps?: number[]
}

export interface ReviewResult {
  stepConfidence: StepConfidence[]
  requiresReview: boolean
  reviewReasons: ReviewReason[]
}

/** Rules whose generic form is a last-resort guess (verify the target). */
const GENERIC_FALLBACK_RULES = new Set(['click'])

/**
 * A generic-fallback flag should fire only when a fallback rule degraded to a
 * bare text/no-strategy guess — NOT when it resolved to a precise role/label
 * locator (e.g. `Click 'Sign In'` → getByRole('button') is high quality).
 */
const isGenericFallback = (a: AnalyzedStep): boolean =>
  a.rule !== null && GENERIC_FALLBACK_RULES.has(a.rule) && (a.strategy === 'text' || a.strategy === null)

/**
 * Assumption language that signals a GENUINE interpretation risk — ambiguity or
 * a guess — not the engine's routine "Assumed X is reachable via getByLabel()"
 * explanatory caveats (which are attached to almost every label-based fill).
 */
const RISKY_ASSUMPTION =
  /\b(guess\w*|ambig\w*|unclear|could not tell|best[- ]?guess|first[- ]?match\w*|multiple[- ]?match\w*|picked the first|may be (?:wrong|incorrect)|might (?:be )?(?:wrong|incorrect))\b/i

/** Did the user's own text supply a CSS/XPath selector (vs. the engine inferring one)? */
const stepProvidedSelector = (step: string): boolean =>
  /\/\/|css=|xpath=|\bselector\b|#[A-Za-z][\w-]*|\.[A-Za-z][\w-]*\[/.test(step)

export function assessReview(
  analyzed: AnalyzedStep[],
  validation: ValidationResult,
): ReviewResult {
  const stepConfidence: StepConfidence[] = analyzed.map((a) => ({
    step: a.step,
    rule: a.rule,
    confidence: a.confidence,
    level: a.level,
    strategy: a.strategy,
    assumptions: a.assumptions,
    warnings: a.warnings,
  }))

  const indexesWhere = (pred: (a: AnalyzedStep) => boolean): number[] =>
    analyzed.map((a, i) => (pred(a) ? i : -1)).filter((i) => i >= 0)

  const reasons: ReviewReason[] = []

  const low = indexesWhere((a) => a.rule !== null && a.confidence < REVIEW_CONFIDENCE_THRESHOLD)
  if (low.length)
    reasons.push({
      code: 'low_confidence',
      message: `${low.length} step(s) below the ${REVIEW_CONFIDENCE_THRESHOLD} confidence threshold.`,
      steps: low,
    })

  const unmapped = indexesWhere((a) => a.rule === null)
  if (unmapped.length)
    reasons.push({
      code: 'unmapped_step',
      message: `${unmapped.length} step(s) could not be mapped to an action.`,
      steps: unmapped,
    })

  const fallback = indexesWhere(isGenericFallback)
  if (fallback.length)
    reasons.push({
      code: 'generic_fallback',
      message: `${fallback.length} step(s) fell back to a bare text-match click — confirm the intended target.`,
      steps: fallback,
    })

  const brittle = indexesWhere(
    (a) => (a.strategy === 'css' || a.strategy === 'xpath') && !stepProvidedSelector(a.step),
  )
  if (brittle.length)
    reasons.push({
      code: 'brittle_locator',
      message: `${brittle.length} step(s) resolved to a CSS/XPath locator you did not specify — prefer an accessible locator.`,
      steps: brittle,
    })

  const risky = indexesWhere((a) => a.assumptions.some((x) => RISKY_ASSUMPTION.test(x)))
  if (risky.length)
    reasons.push({
      code: 'risky_assumption',
      message: `${risky.length} step(s) carry an interpretation assumption worth confirming.`,
      steps: risky,
    })

  if (validation.warnings.length)
    reasons.push({
      code: 'validation_warning',
      message: `Generated code raised ${validation.warnings.length} validation warning(s).`,
    })

  return { stepConfidence, requiresReview: reasons.length > 0, reviewReasons: reasons }
}
