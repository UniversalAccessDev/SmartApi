import { describe, it, expect } from 'vitest'
import { validateGeneratedCode } from '../src/services/validator.service'

const VALID = `import { test, expect } from '@playwright/test'

test('example', async ({ page }) => {
  await page.goto('https://example.com')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved')).toBeVisible()
})
`

describe('validateGeneratedCode', () => {
  it('passes clean code with no warnings', () => {
    const result = validateGeneratedCode(VALID)
    expect(result.valid).toBe(true)
    expect(result.warnings).toEqual([])
  })

  it('flags missing @playwright/test import', () => {
    const result = validateGeneratedCode(VALID.replace("from '@playwright/test'", "from 'x'"))
    expect(result.valid).toBe(false)
    expect(result.warnings.join(' ')).toMatch(/@playwright\/test/)
  })

  it('flags missing test() block', () => {
    const result = validateGeneratedCode(
      "import { expect } from '@playwright/test'\nexpect(1).toBe(1)",
    )
    expect(result.warnings.join(' ')).toMatch(/test\(\) block/)
  })

  it('flags missing expect()', () => {
    const code = "import { test } from '@playwright/test'\ntest('x', async () => {})"
    expect(validateGeneratedCode(code).warnings.join(' ')).toMatch(/expect\(\)/)
  })

  it('flags page.waitForTimeout()', () => {
    const code = VALID.replace(
      "await expect(page.getByText('Saved')).toBeVisible()",
      'await page.waitForTimeout(1000)',
    )
    expect(validateGeneratedCode(code).warnings.join(' ')).toMatch(/waitForTimeout/)
  })

  it('flags real XPath usage', () => {
    const code = VALID.replace(
      "page.getByRole('button', { name: 'Save' })",
      'page.locator(\'//button[@id="save"]\')',
    )
    expect(validateGeneratedCode(code).warnings.join(' ')).toMatch(/XPath/)
  })

  it('does NOT flag a // code comment as XPath (regression)', () => {
    const code = `${VALID}\n// Capture screenshot evidence\n`
    const result = validateGeneratedCode(code)
    expect(result.warnings.join(' ')).not.toMatch(/XPath/)
    expect(result.valid).toBe(true)
  })

  it('flags unmapped TODO steps', () => {
    const code = `${VALID}\n// TODO: Smart API could not map this step -> "foo"\n`
    expect(validateGeneratedCode(code).warnings.join(' ')).toMatch(/TODO/)
  })
})
