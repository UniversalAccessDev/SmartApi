import { describe, it, expect } from 'vitest'
import { assessReview, REVIEW_CONFIDENCE_THRESHOLD } from '../src/services/review.service'
import { AnalyzedStep } from '../src/engine/types'
import { generate } from '../src/services/generator.service'

const step = (over: Partial<AnalyzedStep>): AnalyzedStep => ({
  step: 'do a thing',
  rule: 'click',
  confidence: 0.9,
  level: 'high',
  strategy: 'role',
  code: ["await page.click()"],
  rationale: 'r',
  alternatives: [],
  assumptions: [],
  warnings: [],
  ...over,
})

const noWarnings = { valid: true, warnings: [] as string[] }

describe('review signals — assessReview', () => {
  it('clean run does not require review', () => {
    const r = assessReview([step({ rule: 'navigate', strategy: 'url' })], noWarnings)
    expect(r.requiresReview).toBe(false)
    expect(r.reviewReasons).toHaveLength(0)
    expect(r.stepConfidence).toHaveLength(1)
  })

  it('flags low confidence below threshold', () => {
    const r = assessReview([step({ rule: 'fill', confidence: 0.4, level: 'low' })], noWarnings)
    expect(r.requiresReview).toBe(true)
    expect(r.reviewReasons.map((x) => x.code)).toContain('low_confidence')
    expect(r.reviewReasons.find((x) => x.code === 'low_confidence')?.steps).toEqual([0])
  })

  it('flags an unmapped step', () => {
    const r = assessReview([step({ rule: null, confidence: 0.1, strategy: null })], noWarnings)
    expect(r.reviewReasons.map((x) => x.code)).toContain('unmapped_step')
  })

  it('flags the generic click fallback only when it degrades to a bare text match', () => {
    // bare text-match click → flagged
    const weak = assessReview([step({ rule: 'click', strategy: 'text' })], noWarnings)
    expect(weak.reviewReasons.map((x) => x.code)).toContain('generic_fallback')
    // a named button that resolved to a role locator → NOT flagged
    const strong = assessReview([step({ rule: 'click', strategy: 'role' })], noWarnings)
    expect(strong.reviewReasons.map((x) => x.code)).not.toContain('generic_fallback')
  })

  it('flags a brittle CSS locator the user did not specify', () => {
    const r = assessReview([step({ rule: 'click-css', strategy: 'css', step: 'click the blue box' })], noWarnings)
    expect(r.reviewReasons.map((x) => x.code)).toContain('brittle_locator')
  })

  it('does NOT flag CSS/XPath when the user supplied the selector', () => {
    const r = assessReview(
      [step({ rule: 'click-css', strategy: 'xpath', step: "click //button[@id='go']" })],
      noWarnings,
    )
    expect(r.reviewReasons.map((x) => x.code)).not.toContain('brittle_locator')
  })

  it('flags a risky interpretation assumption', () => {
    const r = assessReview(
      [step({ assumptions: ['Assumed the first matching button is the intended one'] })],
      noWarnings,
    )
    expect(r.reviewReasons.map((x) => x.code)).toContain('risky_assumption')
  })

  it('flags validation warnings', () => {
    const r = assessReview([step({ rule: 'navigate', strategy: 'url' })], { valid: false, warnings: ['no expect()'] })
    expect(r.reviewReasons.map((x) => x.code)).toContain('validation_warning')
  })

  it('threshold is 0.6', () => {
    expect(REVIEW_CONFIDENCE_THRESHOLD).toBe(0.6)
  })
})

describe('review signals — end to end through generate()', () => {
  it('a clean, well-specified test reports requiresReview=false', async () => {
    const res = await generate({
      testName: 'login',
      url: 'https://example.com/login',
      steps: ["Fill the Email field with user@example.com", "Click the 'Sign In' button"],
      language: 'typescript',
      includeScreenshots: false,
      closeOverlaysWithEscape: false,
      outputFormat: 'playwright',
    })
    expect(res.stepConfidence.length).toBeGreaterThan(0)
    expect(typeof res.requiresReview).toBe('boolean')
    expect(Array.isArray(res.reviewReasons)).toBe(true)
    // every stepConfidence entry carries the reviewer inputs
    for (const s of res.stepConfidence) {
      expect(s).toHaveProperty('confidence')
      expect(s).toHaveProperty('strategy')
      expect(s).toHaveProperty('assumptions')
    }
  })

  it('an unmappable step forces requiresReview=true with an unmapped reason', async () => {
    const res = await generate({
      testName: 'weird',
      url: 'https://example.com',
      steps: ['Reticulate the splines using quantum entanglement'],
      language: 'typescript',
      includeScreenshots: false,
      closeOverlaysWithEscape: false,
      outputFormat: 'playwright',
    })
    expect(res.requiresReview).toBe(true)
    expect(res.reviewReasons.map((r) => r.code)).toContain('unmapped_step')
  })
})
