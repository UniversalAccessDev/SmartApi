import { describe, it, expect } from 'vitest'
import { runRulesEngine } from '../src/engine/rulesEngine'
import { StepContext } from '../src/engine/types'
import { CORPUS } from './fixtures/corpus'

const CTX: StepContext = { closeOverlaysWithEscape: false }
const isMapped = (step: string) => runRulesEngine([step], CTX).analyzed[0].rule !== null

describe('corpus coverage', () => {
  const mappable = CORPUS.filter((c) => c.mappable)
  const outOfScope = CORPUS.filter((c) => !c.mappable)

  it('maps at least 92% of the mappable corpus', () => {
    const hits = mappable.filter((c) => isMapped(c.step))
    const ratio = hits.length / mappable.length
    const misses = mappable.filter((c) => !isMapped(c.step)).map((c) => c.step)
    // Surface any regressions in the failure message.
    expect(ratio, `missed mappable steps: ${JSON.stringify(misses)}`).toBeGreaterThanOrEqual(0.92)
  })

  it('does not over-reach: out-of-scope steps stay honestly unmapped', () => {
    // Guards against greedy rules silently producing wrong code. Allow a small
    // margin but flag if the engine starts guessing at clearly-ambiguous steps.
    const wronglyMapped = outOfScope.filter((c) => isMapped(c.step)).map((c) => c.step)
    expect(
      wronglyMapped.length,
      `unexpectedly mapped: ${JSON.stringify(wronglyMapped)}`,
    ).toBeLessThanOrEqual(2)
  })
})
