import { GenerateInput } from '../schemas/generate.schema'
import { runRulesEngine } from '../engine/rulesEngine'
import { buildTestFile, composeStatements } from '../engine/codeBuilder'
import { toActions, Action } from '../engine/actions'
import { slugify } from '../utils/slug'
import { formatCode } from '../utils/formatCode'
import { validateGeneratedCode, ValidationResult } from './validator.service'
import { AnalyzedStep, StepContext } from '../engine/types'
import { ConfidenceLevel, levelFor } from '../engine/explain'

/** Interpretable confidence summary for the whole generated test. */
export interface ConfidenceSummary {
  /** Mean per-step confidence (0..1). */
  score: number
  /** Band for the overall score. */
  level: ConfidenceLevel
  /** Count of steps in each band. */
  breakdown: { high: number; medium: number; low: number }
  /** Number of steps that could not be mapped at all. */
  unmappedSteps: number
  /** Plain-English meaning of the bands (so the score is not a mystery). */
  note: string
}

export interface GenerateResult {
  code: string
  /** Structured action-JSON for non-Playwright executors (outputFormat: "actions"). */
  actions: Action[]
  language: string
  locatorStrategy: string
  confidenceScore: number
  confidence: ConfidenceSummary
  assumptions: string[]
  warnings: string[]
  validation: ValidationResult
  meta: {
    stepsAnalyzed: AnalyzedStep[]
    unmatchedSteps: string[]
    ruleEngineWarnings: string[]
  }
}

const CONFIDENCE_NOTE =
  'Heuristic, locator-strategy-aware score (not empirically calibrated): high (>=0.8) leans on role/label/url locators with low ambiguity; medium (>=0.6) is reasonable but verify the locator; low (<0.6) is fragile/ambiguous or unmapped — review before running.'

const summarizeConfidence = (score: number, analyzed: AnalyzedStep[]): ConfidenceSummary => {
  const breakdown = { high: 0, medium: 0, low: 0 }
  for (const s of analyzed) breakdown[s.level] += 1
  return {
    score,
    level: levelFor(score),
    breakdown,
    unmappedSteps: analyzed.filter((s) => s.rule === null).length,
    note: CONFIDENCE_NOTE,
  }
}

/**
 * Orchestrates the full generation pipeline:
 *   rules engine -> code builder -> Prettier -> static validation.
 * Pure and deterministic: the same input always yields the same output.
 */
export interface GenerateOptions {
  /** Optional org knowledge-base resolver, consulted before the generic rules. */
  resolveFromKb?: (step: string) => ReturnType<NonNullable<StepContext['resolveFromKb']>>
}

export const generate = async (
  input: GenerateInput,
  options: GenerateOptions = {},
): Promise<GenerateResult> => {
  const engine = runRulesEngine(input.steps, {
    closeOverlaysWithEscape: input.closeOverlaysWithEscape,
    resolveFromKb: options.resolveFromKb,
  })

  const rawCode = buildTestFile({
    testName: input.testName,
    url: input.url,
    bodyLines: engine.bodyLines,
    includeScreenshots: input.includeScreenshots,
  })

  const code = await formatCode(rawCode)
  const validation = validateGeneratedCode(code)

  // Structured action-JSON view of the same statements (shared goto dedup).
  const actions = toActions(composeStatements(input.url, engine.bodyLines))
  if (input.includeScreenshots) {
    actions.push({ type: 'screenshot', name: slugify(input.testName) })
  }

  const warnings = [...engine.warnings, ...validation.warnings]
  if (input.language === 'javascript') {
    warnings.unshift(
      'JavaScript output is not supported yet; returning TypeScript (the engine is TypeScript-first).',
    )
  }

  const locatorStrategy = engine.strategies.length > 0 ? engine.strategies.join('-') : 'none'

  return {
    code,
    actions,
    language: 'typescript',
    locatorStrategy,
    confidenceScore: engine.confidence,
    confidence: summarizeConfidence(engine.confidence, engine.analyzed),
    assumptions: engine.assumptions,
    warnings,
    validation,
    meta: {
      stepsAnalyzed: engine.analyzed,
      unmatchedSteps: engine.unmatchedSteps,
      ruleEngineWarnings: engine.warnings,
    },
  }
}
