/**
 * Locator strategies the engine can emit. Aggregated across a test run to
 * report a human-readable `locatorStrategy` (e.g. "role-label-text").
 */
export type LocatorStrategy =
  | 'role'
  | 'label'
  | 'placeholder'
  | 'text'
  | 'testid'
  | 'css'
  | 'xpath'
  | 'frame'
  | 'keyboard'
  | 'url'

/** Options from the request that influence how steps are translated. */
export interface StepContext {
  closeOverlaysWithEscape: boolean
}

/** What a rule returns when it matches a step. */
export interface RuleOutput {
  /** One or more Playwright statements (no leading indentation). */
  lines: string[]
  /** Locator strategies used by these statements. */
  strategies: LocatorStrategy[]
  /** Any assumptions a reviewer should double-check. */
  assumptions: string[]
  /** Confidence (0..1) that this translation is correct. */
  confidence: number
}

/**
 * A single, self-contained translation rule. Add a new behavior by writing a
 * new rule and registering it in `rules/index.ts` — nothing else changes.
 */
export interface StepRule {
  /** Stable identifier, surfaced in the response meta for debugging. */
  name: string
  /** Human description of what phrasings this rule handles. */
  description: string
  /** Return a RuleOutput if this rule applies, otherwise null. */
  apply(step: string, ctx: StepContext): RuleOutput | null
}

/** Per-step diagnostic info returned in the response meta. */
export interface AnalyzedStep {
  step: string
  rule: string | null
  confidence: number
}

/** Aggregate result of running the engine over all steps. */
export interface EngineResult {
  bodyLines: string[]
  strategies: LocatorStrategy[]
  assumptions: string[]
  confidence: number
  warnings: string[]
  analyzed: AnalyzedStep[]
  unmatchedSteps: string[]
}
