import { describe, it, expect } from 'vitest'
import { generate } from '../src/services/generator.service'
import { GenerateInput } from '../src/schemas/generate.schema'

const baseInput = (overrides: Partial<GenerateInput> = {}): GenerateInput => ({
  testName: 'Add new contact',
  url: 'https://atwallabs.com/demo/crm',
  steps: ['Click Add Contact', 'Enter Full Name as Jane Doe', 'Verify Jane Doe appears'],
  language: 'typescript',
  includeScreenshots: false,
  closeOverlaysWithEscape: false,
  ...overrides,
})

describe('generate pipeline', () => {
  it('produces formatted, valid Playwright code', async () => {
    const result = await generate(baseInput())
    expect(result.code).toContain("import { test, expect } from '@playwright/test'")
    expect(result.code).toContain("test('Add new contact'")
    expect(result.code).toContain("await page.goto('https://atwallabs.com/demo/crm')")
    expect(result.code).toContain('expect(')
    // Prettier output uses single quotes and no semicolons.
    expect(result.code).not.toMatch(/;\s*$/m)
    expect(result.validation.valid).toBe(true)
    expect(result.warnings).toEqual([])
  })

  it('reports an aggregated locatorStrategy and numeric confidence', async () => {
    const result = await generate(baseInput())
    expect(result.locatorStrategy).toBe('role-label-text')
    expect(result.confidenceScore).toBeGreaterThan(0)
    expect(result.confidenceScore).toBeLessThanOrEqual(1)
  })

  it('adds a screenshot when includeScreenshots is true', async () => {
    const result = await generate(baseInput({ includeScreenshots: true }))
    expect(result.code).toContain(
      "await page.screenshot({ path: 'screenshots/add-new-contact.png', fullPage: true })",
    )
  })

  it('omits the screenshot when includeScreenshots is false', async () => {
    const result = await generate(baseInput({ includeScreenshots: false }))
    expect(result.code).not.toContain('page.screenshot')
  })

  it('honors closeOverlaysWithEscape', async () => {
    const result = await generate(
      baseInput({ steps: ['Close the modal'], closeOverlaysWithEscape: true }),
    )
    expect(result.code).toContain("await page.keyboard.press('Escape')")
  })

  it('warns and falls back to TypeScript when language is javascript', async () => {
    const result = await generate(baseInput({ language: 'javascript' }))
    expect(result.language).toBe('typescript')
    expect(result.warnings.join(' ')).toMatch(/JavaScript output is not supported/)
  })

  it('surfaces unmatched steps in warnings and meta', async () => {
    const result = await generate(baseInput({ steps: ['Click Save', 'Frobnicate the gizmo'] }))
    expect(result.meta.unmatchedSteps).toEqual(['Frobnicate the gizmo'])
    expect(result.validation.valid).toBe(false)
  })

  it('is deterministic: identical input yields identical output', async () => {
    const a = await generate(baseInput())
    const b = await generate(baseInput())
    expect(a.code).toBe(b.code)
    expect(a.confidenceScore).toBe(b.confidenceScore)
  })

  it('never emits waitForTimeout, even for wait steps', async () => {
    const result = await generate(baseInput({ steps: ['Wait for Dashboard to load'] }))
    expect(result.code).not.toContain('waitForTimeout')
    expect(result.code).toContain('toBeVisible()')
  })
})
