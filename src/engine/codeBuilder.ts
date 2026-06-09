import { lit } from '../utils/literal'
import { slugify } from '../utils/slug'

export interface BuildTestFileArgs {
  testName: string
  url: string
  bodyLines: string[]
  includeScreenshots: boolean
}

/**
 * Produce the full ordered statement list for a test: a single leading
 * `page.goto(url)` followed by the body — with any body `goto` to the SAME url
 * removed so a "Go to <url>" step plus the url parameter don't emit two
 * identical navigations. A `goto` to a different url is kept (real navigation).
 */
export const composeStatements = (url: string, bodyLines: string[]): string[] => {
  const gotoStmt = `await page.goto(${lit(url)})`
  const body = bodyLines.filter((line) => line.trim() !== gotoStmt)
  return [gotoStmt, ...body]
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

  for (const stmt of composeStatements(url, bodyLines)) {
    lines.push(`  ${stmt}`)
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
