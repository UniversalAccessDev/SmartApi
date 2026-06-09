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
  /**
   * Optional org knowledge-base resolver. Consulted BEFORE the generic rules so
   * an org's learned/taught locators take precedence. Returns null to fall back.
   */
  resolveFromKb?: (step: string) => RuleOutput | null
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

/** Per-step diagnostic + explainability info returned in the response meta. */
export interface AnalyzedStep {
  step: string
  rule: string | null
  confidence: number
  /** Confidence band for the score: high (>=0.8) / medium (>=0.6) / low. */
  level: 'high' | 'medium' | 'low'
  /** Primary locator strategy used for this step (null when unmapped). */
  strategy: LocatorStrategy | null
  /** The Playwright statement(s) generated for this step. */
  code: string[]
  /** One-line explanation of why this locator/action was chosen. */
  rationale: string
  /** Concrete fallback locators to try if the primary one does not match. */
  alternatives: string[]
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
