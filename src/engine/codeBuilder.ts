import { lit } from '../utils/literal'
import { slugify } from '../utils/slug'

export interface BuildTestFileArgs {
  testName: string
  url: string
  bodyLines: string[]
  includeScreenshots: boolean
}

/**
 * Assemble a complete, CI-ready Playwright test file from the engine output.
 * Indentation here is a best-effort; Prettier normalizes it afterwards.
 */
export const buildTestFile = ({
  testName,
  url,
  bodyLines,
  includeScreenshots,
}: BuildTestFileArgs): string => {
  const lines: string[] = []

  lines.push(`import { test, expect } from '@playwright/test'`)
  lines.push('')
  lines.push(`test(${lit(testName)}, async ({ page }) => {`)
  lines.push(`  await page.goto(${lit(url)})`)

  for (const bodyLine of bodyLines) {
    lines.push(`  ${bodyLine}`)
  }

  if (includeScreenshots) {
    const path = `screenshots/${slugify(testName)}.png`
    lines.push('')
    lines.push('  // Capture screenshot evidence after the final assertion')
    lines.push(`  await page.screenshot({ path: ${lit(path)}, fullPage: true })`)
  }

  lines.push('})')
  lines.push('')

  return lines.join('\n')
}
