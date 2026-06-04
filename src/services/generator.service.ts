import { GenerateInput } from '../schemas/generate.schema'
import { runRulesEngine } from '../engine/rulesEngine'
import { buildTestFile } from '../engine/codeBuilder'
import { formatCode } from '../utils/formatCode'
import { validateGeneratedCode, ValidationResult } from './validator.service'
import { AnalyzedStep } from '../engine/types'

export interface GenerateResult {
  code: string
  language: string
  locatorStrategy: string
  confidenceScore: number
  assumptions: string[]
  warnings: string[]
  validation: ValidationResult
  meta: {
    stepsAnalyzed: AnalyzedStep[]
    unmatchedSteps: string[]
    ruleEngineWarnings: string[]
  }
}

/**
 * Orchestrates the full generation pipeline:
 *   rules engine -> code builder -> Prettier -> static validation.
 * Pure and deterministic: the same input always yields the same output.
 */
export const generate = async (input: GenerateInput): Promise<GenerateResult> => {
  const engine = runRulesEngine(input.steps, {
    closeOverlaysWithEscape: input.closeOverlaysWithEscape,
  })

  const rawCode = buildTestFile({
    testName: input.testName,
    url: input.url,
    bodyLines: engine.bodyLines,
    includeScreenshots: input.includeScreenshots,
  })

  const code = await formatCode(rawCode)
  const validation = validateGeneratedCode(code)

  const warnings = [...engine.warnings, ...validation.warnings]
  if (input.language === 'javascript') {
    warnings.unshift(
      'JavaScript output is not supported yet; returning TypeScript (the engine is TypeScript-first).',
    )
  }

  const locatorStrategy = engine.strategies.length > 0 ? engine.strategies.join('-') : 'none'

  return {
    code,
    language: 'typescript',
    locatorStrategy,
    confidenceScore: engine.confidence,
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
