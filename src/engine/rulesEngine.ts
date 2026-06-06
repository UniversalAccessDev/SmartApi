import { EngineResult, LocatorStrategy, RuleOutput, StepContext } from './types'
import { RULES } from './rules'

/** Canonical ordering for rendering the aggregate locatorStrategy label. */
const STRATEGY_ORDER: LocatorStrategy[] = [
  'role',
  'label',
  'placeholder',
  'text',
  'testid',
  'keyboard',
  'url',
]

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Run every step through the ordered rule registry and aggregate the results
 * into Playwright statements plus metadata (confidence, assumptions, warnings).
 */
export const runRulesEngine = (steps: string[], ctx: StepContext): EngineResult => {
  const bodyLines: string[] = []
  const strategies = new Set<LocatorStrategy>()
  const assumptions = new Set<string>()
  const warnings: string[] = []
  const analyzed: EngineResult['analyzed'] = []
  const unmatchedSteps: string[] = []
  const confidences: number[] = []

  for (const step of steps) {
    // Single pass: apply each rule once and stop at the first match.
    let matched: { name: string; output: RuleOutput } | null = null
    for (const rule of RULES) {
      const output = rule.apply(step, ctx)
      if (output) {
        matched = { name: rule.name, output }
        break
      }
    }

    if (!matched) {
      bodyLines.push(`// TODO: Smart API could not map this step -> "${step}"`)
      analyzed.push({ step, rule: null, confidence: 0.1 })
      confidences.push(0.1)
      unmatchedSteps.push(step)
      warnings.push(`Step could not be mapped to a Playwright action: "${step}"`)
      continue
    }

    const { name, output } = matched
    bodyLines.push(...output.lines)
    output.strategies.forEach((s) => strategies.add(s))
    output.assumptions.forEach((a) => assumptions.add(a))
    analyzed.push({ step, rule: name, confidence: output.confidence })
    confidences.push(output.confidence)
  }

  const confidence =
    confidences.length === 0
      ? 0
      : round2(confidences.reduce((sum, c) => sum + c, 0) / confidences.length)

  const orderedStrategies = STRATEGY_ORDER.filter((s) => strategies.has(s))

  return {
    bodyLines,
    strategies: orderedStrategies,
    assumptions: [...assumptions],
    confidence,
    warnings,
    analyzed,
    unmatchedSteps,
  }
}
