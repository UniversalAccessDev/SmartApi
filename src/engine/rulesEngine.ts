import { EngineResult, LocatorStrategy, RuleOutput, StepContext } from './types'
import { RULES } from './rules'
import { explainStep, levelFor } from './explain'

/** Canonical ordering for rendering the aggregate locatorStrategy label. */
const STRATEGY_ORDER: LocatorStrategy[] = [
  'role',
  'label',
  'placeholder',
  'text',
  'testid',
  'css',
  'xpath',
  'frame',
  'keyboard',
  'url',
]

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Run every step through the ordered rule registry and aggregate the results
 * into Playwright statements plus metadata (confidence, assumptions, warnings).
 */
/**
 * Normalize a raw step before any rule sees it: strip list/Gherkin/sequencer
 * prefixes and trailing sentence punctuation. This unblocks whole classes of
 * otherwise-unmapped steps ("1. Click Login", "Then the page loads", "Click OK.")
 * without each rule needing to special-case the noise.
 */
/** Does the step read as a conditional ("if/when X is visible/appears, ...")? */
const isConditional = (step: string): boolean =>
  /^(?:if|when|unless)\b/i.test(step.trim()) &&
  /\b(?:appears?|is\s+(?:visible|present|shown|displayed)|shows?\s+up|pops?\s+up|exists?|is\s+there)\b/i.test(
    step,
  )

const normalizeStep = (step: string): string => {
  let s = step.trim()
  // Leading list markers: "1.", "2)", "- ", "* "
  s = s.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '')
  // Preserve conditionals: don't strip their leading "When"/"If" as Gherkin noise.
  if (isConditional(s)) return s.replace(/[.!]+$/, '').trim()
  // "Step 3:" / "Step 3 -" prefixes
  s = s.replace(/^step\s+\d+\s*[:.)-]?\s+/i, '')
  // Gherkin keywords + optional subject ("Given the user ", "When I ", "Then ")
  s = s.replace(
    /^(?:given|when|then|and|but)\s+(?:i\s+|the\s+user\s+(?:is\s+|has\s+)?|you\s+)?/i,
    '',
  )
  // Sequencer adverbs ("First,", "Next,", "Finally,", "After that,")
  s = s.replace(
    /^(?:first|next|then|finally|afterwards?|after\s+that|now|lastly|secondly|thirdly)\s*,?\s+/i,
    '',
  )
  // Trailing sentence punctuation / emphasis (keep a single ? for questions? no — assertions don't need it)
  s = s.replace(/[.!]+$/, '').trim()
  return s || step.trim()
}

/** Does this step map to any rule (or the org KB)? */
const mapsToRule = (step: string, ctx: StepContext): boolean =>
  ctx.resolveFromKb?.(step) != null || RULES.some((r) => r.apply(step, ctx) !== null)

/**
 * Split a compound step ("Enter Name as Jane and click Submit") into its action
 * segments — but ONLY when every segment independently maps. This avoids
 * splitting legitimate phrases like "Terms and Conditions" or a button literally
 * named "Save and Continue" (whose halves don't both map to actions).
 */
const expandStep = (step: string, ctx: StepContext): string[] => {
  // Conditionals are control-flow, not compounds — never split them.
  if (/^(?:if|when|unless)\b/i.test(step.trim())) return [step]
  // Connectors: "and then" / "then" / "and", an optional leading comma, plus
  // "&"/"+" and a sentence boundary (". Then" / ". ").
  const CONNECTOR = /\s*,?\s+(?:and\s+then|then|and)\s+|\s*&{1,2}\s*|\s+\+\s+|\.\s+(?=[A-Z])/
  if (!CONNECTOR.test(step)) return [step]
  const segments = step
    .split(CONNECTOR)
    .map((s) =>
      s
        .trim()
        .replace(/[.,]+$/, '')
        .trim(),
    )
    .filter(Boolean)
  if (segments.length < 2) return [step]
  return segments.every((seg) => mapsToRule(seg, ctx)) ? segments : [step]
}

export const runRulesEngine = (steps: string[], baseCtx: StepContext): EngineResult => {
  const bodyLines: string[] = []
  const strategies = new Set<LocatorStrategy>()
  const assumptions = new Set<string>()
  const warnings: string[] = []
  const analyzed: EngineResult['analyzed'] = []
  const unmatchedSteps: string[] = []
  const confidences: number[] = []

  // Augment the context with a sub-step resolver (KB-first, then the registry)
  // so compound rules (e.g. conditional) can translate their inner action.
  const ctx: StepContext = { ...baseCtx }
  ctx.resolveStep = (sub: string): RuleOutput | null => {
    const kb = ctx.resolveFromKb?.(sub)
    if (kb) return kb
    for (const rule of RULES) {
      const out = rule.apply(sub, ctx)
      if (out) return out
    }
    return null
  }

  // Normalize (strip list/Gherkin/sequencer noise) then expand compound
  // "X and Y" steps into individual actions.
  const expandedSteps = steps.flatMap((s) => expandStep(normalizeStep(s), ctx))

  for (const step of expandedSteps) {
    // KB-first: an org's learned/taught locators take precedence over generic rules.
    let matched: { name: string; output: RuleOutput } | null = null
    const kbOutput = ctx.resolveFromKb?.(step)
    if (kbOutput) {
      matched = { name: 'kb', output: kbOutput }
    } else {
      // Single pass: apply each rule once and stop at the first match.
      for (const rule of RULES) {
        const output = rule.apply(step, ctx)
        if (output) {
          matched = { name: rule.name, output }
          break
        }
      }
    }

    if (!matched) {
      bodyLines.push(`// TODO: Smart API could not map this step -> "${step}"`)
      analyzed.push({
        step,
        rule: null,
        confidence: 0.1,
        level: 'low',
        strategy: null,
        code: [],
        rationale: 'No rule matched this phrasing; left as a TODO for manual translation.',
        alternatives: [],
        assumptions: [],
        warnings: [`Step could not be mapped to a Playwright action: "${step}"`],
      })
      confidences.push(0.1)
      unmatchedSteps.push(step)
      warnings.push(`Step could not be mapped to a Playwright action: "${step}"`)
      continue
    }

    const { name, output } = matched
    bodyLines.push(...output.lines)
    output.strategies.forEach((s) => strategies.add(s))
    output.assumptions.forEach((a) => assumptions.add(a))
    const { rationale, alternatives } = explainStep(
      output.lines,
      output.strategies,
      name,
      output.assumptions,
    )
    analyzed.push({
      step,
      rule: name,
      confidence: output.confidence,
      level: levelFor(output.confidence),
      strategy: output.strategies[0] ?? null,
      code: output.lines,
      rationale,
      alternatives,
      assumptions: output.assumptions,
      warnings: [],
    })
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
