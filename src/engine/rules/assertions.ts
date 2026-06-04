import { StepRule } from '../types'
import { lit } from '../../utils/literal'

/** Assert the page URL: "verify url is X", "expect the url to contain X". */
export const assertUrlRule: StepRule = {
  name: 'assert-url',
  description: 'Asserts the page URL: "verify url is <url>", "url should contain <fragment>"',
  apply(step) {
    const match =
      /^(?:verify|assert|ensure|expect|check)\s+(?:that\s+)?(?:the\s+)?(?:page\s+)?url\s+(?:is|to be|equals|should be|contains|should contain)\s+(.+)$/i.exec(
        step.trim(),
      )
    if (!match) return null

    return {
      lines: [`await expect(page).toHaveURL(${lit(match[1].trim())})`],
      strategies: ['url'],
      assumptions: [],
      confidence: 0.85,
    }
  },
}

/** Assert the page title: "verify title is X". */
export const assertTitleRule: StepRule = {
  name: 'assert-title',
  description: 'Asserts the page title: "verify title is <title>"',
  apply(step) {
    const match =
      /^(?:verify|assert|ensure|expect|check)\s+(?:that\s+)?(?:the\s+)?(?:page\s+)?title\s+(?:is|to be|equals|should be)\s+(.+)$/i.exec(
        step.trim(),
      )
    if (!match) return null

    return {
      lines: [`await expect(page).toHaveTitle(${lit(match[1].trim())})`],
      strategies: ['url'],
      assumptions: [],
      confidence: 0.85,
    }
  },
}

/**
 * Assert an element/text is visible. Handles the most common QA phrasings:
 * "verify X appears", "X should be visible", "expect to see X".
 */
export const assertVisibleRule: StepRule = {
  name: 'assert-visible',
  description:
    'Asserts visibility: "verify <text> appears", "<text> should be visible", "expect to see <text>"',
  apply(step) {
    const s = step.trim()

    const patterns: RegExp[] = [
      /^(?:verify|assert|ensure|confirm|check|make sure)\s+(?:that\s+)?(.+?)\s+(?:appears?|is\s+(?:visible|displayed|present|shown)|shows up|exists)\b.*$/i,
      /^(.+?)\s+should\s+(?:be\s+visible|appear|be\s+displayed|be\s+present)$/i,
      /^expect to see\s+(.+)$/i,
      /^see\s+(.+)$/i,
    ]

    for (const pattern of patterns) {
      const match = pattern.exec(s)
      if (match) {
        const text = match[1].trim()
        return {
          lines: [`await expect(page.getByText(${lit(text)})).toBeVisible()`],
          strategies: ['text'],
          assumptions: [
            `Asserted visibility of the text "${text}" via getByText(); use a more specific role/label locator if the text is ambiguous.`,
          ],
          confidence: 0.7,
        }
      }
    }
    return null
  },
}

/** Assert an element contains text: "verify the header contains Welcome". */
export const assertContainsRule: StepRule = {
  name: 'assert-contains-text',
  description: 'Asserts text content: "verify <area> contains <text>"',
  apply(step) {
    const match =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+(?:contains|should contain|has)\s+(?:the\s+)?(?:text\s+)?(.+)$/i.exec(
        step.trim(),
      )
    if (!match) return null

    const area = match[1].trim()
    const text = match[2].trim()
    return {
      lines: [`await expect(page.getByText(${lit(area)})).toContainText(${lit(text)})`],
      strategies: ['text'],
      assumptions: [
        `Assumed "${area}" can be located via getByText(); adjust the locator if it is a specific region/role.`,
      ],
      confidence: 0.6,
    }
  },
}

/**
 * Translate "wait for X" into a web-first assertion instead of a fixed timeout.
 * This deliberately enforces the "never use page.waitForTimeout()" rule.
 */
export const waitForRule: StepRule = {
  name: 'wait-for',
  description: 'Waits for an element via assertion: "wait for <text> to appear/load"',
  apply(step) {
    const match = /^wait for\s+(.+?)(?:\s+to\s+(?:appear|be\s+visible|load|show))?$/i.exec(
      step.trim(),
    )
    if (!match) return null

    const text = match[1].trim()
    return {
      lines: [`await expect(page.getByText(${lit(text)})).toBeVisible()`],
      strategies: ['text'],
      assumptions: [
        `Converted a wait into a web-first assertion on "${text}" (no fixed timeouts are ever generated).`,
      ],
      confidence: 0.65,
    }
  },
}
