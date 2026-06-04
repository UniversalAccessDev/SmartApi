import { describe, it, expect } from 'vitest'
import { runRulesEngine } from '../src/engine/rulesEngine'
import { StepContext } from '../src/engine/types'

const CTX: StepContext = { closeOverlaysWithEscape: false }

describe('runRulesEngine aggregation', () => {
  it('averages per-step confidence and rounds to 2 decimals', () => {
    // click (0.7) + fill (0.78) => avg 0.74
    const result = runRulesEngine(['Click Add Contact', 'Enter Name as Jane'], CTX)
    expect(result.confidence).toBe(0.74)
  })

  it('aggregates distinct strategies in canonical order', () => {
    const result = runRulesEngine(['Click Save', 'Enter Name as Jane', 'Verify Jane appears'], CTX)
    // role (click) + label (fill) + text (assert) in STRATEGY_ORDER order
    expect(result.strategies).toEqual(['role', 'label', 'text'])
  })

  it('deduplicates repeated assumptions', () => {
    const result = runRulesEngine(['Click Foo', 'Click Bar'], CTX)
    const buttonAssumptions = result.assumptions.filter((a) => a.includes('is a button'))
    // Two generic clicks produce distinct names, so two assumptions — but identical
    // phrasing for the same name must not duplicate:
    const dup = runRulesEngine(['Click Foo', 'Click Foo'], CTX)
    const dupButtonAssumptions = dup.assumptions.filter((a) => a.includes('"Foo" is a button'))
    expect(buttonAssumptions.length).toBe(2)
    expect(dupButtonAssumptions.length).toBe(1)
  })

  it('records one warning per unmatched step', () => {
    const result = runRulesEngine(['Click Save', 'Xyzzy', 'Plugh'], CTX)
    expect(result.unmatchedSteps).toEqual(['Xyzzy', 'Plugh'])
    expect(result.warnings).toHaveLength(2)
  })

  it('produces one body line per step (plus none extra)', () => {
    const steps = ['Click Save', 'Enter Name as Jane', 'Verify Jane appears']
    const result = runRulesEngine(steps, CTX)
    expect(result.bodyLines).toHaveLength(steps.length)
  })

  it('lowers overall confidence when a step is unmatched', () => {
    const matched = runRulesEngine(['Click Save'], CTX).confidence
    const withUnmatched = runRulesEngine(['Click Save', 'Xyzzy'], CTX).confidence
    expect(withUnmatched).toBeLessThan(matched)
  })
})
