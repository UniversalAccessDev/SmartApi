import { describe, it, expect } from 'vitest'
import { generateSchema } from '../src/schemas/generate.schema'

describe('generateSchema', () => {
  it('accepts a valid payload and applies defaults', () => {
    const parsed = generateSchema.parse({
      testName: 'Login',
      url: 'https://example.com',
      steps: ['Click Login'],
    })
    expect(parsed.language).toBe('typescript')
    expect(parsed.includeScreenshots).toBe(false)
    expect(parsed.closeOverlaysWithEscape).toBe(false)
  })

  it('rejects an invalid URL', () => {
    const result = generateSchema.safeParse({
      testName: 'x',
      url: 'not-a-url',
      steps: ['Click x'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty steps', () => {
    const result = generateSchema.safeParse({
      testName: 'x',
      url: 'https://example.com',
      steps: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects an empty testName', () => {
    const result = generateSchema.safeParse({
      testName: '',
      url: 'https://example.com',
      steps: ['Click x'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown language', () => {
    const result = generateSchema.safeParse({
      testName: 'x',
      url: 'https://example.com',
      steps: ['Click x'],
      language: 'python',
    })
    expect(result.success).toBe(false)
  })
})
