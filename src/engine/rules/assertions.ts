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

/**
 * Assert an element is NOT visible / hidden / removed / gone / disappeared.
 * Registered before assert-visible so negatives are not mis-read as positives.
 */
export const assertHiddenRule: StepRule = {
  name: 'assert-hidden',
  description:
    'Asserts something is hidden: "verify <text> is not visible", "<text> should disappear", "verify <text> is removed/gone"',
  apply(step) {
    const s = step.trim()
    const patterns: RegExp[] = [
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(.+?)\s+(?:is\s+(?:not\s+(?:visible|displayed|present|shown)|hidden|gone|removed)|disappears?|is\s+no\s+longer\s+(?:visible|present|shown))\b.*$/i,
      /^(.+?)\s+should\s+(?:disappear|not\s+be\s+visible|be\s+hidden|be\s+removed|be\s+gone)$/i,
    ]
    for (const pattern of patterns) {
      const match = pattern.exec(s)
      if (match) {
        const text = match[1].trim()
        return {
          lines: [`await expect(page.getByText(${lit(text)})).toBeHidden()`],
          strategies: ['text'],
          assumptions: [
            `Asserted the text "${text}" is hidden via getByText(); use a more specific locator if it is ambiguous.`,
          ],
          confidence: 0.68,
        }
      }
    }
    return null
  },
}

/** Map a target phrase to a locator, inferring button/link role from a suffix. */
const elementLocator = (raw: string): { expr: string; strategy: 'role' | 'label' } => {
  const name = raw.trim().replace(/^["']|["']$/g, '')
  const roleMatch = /^(.*?)\s+(button|link|tab|checkbox)$/i.exec(name)
  if (roleMatch) {
    const role = roleMatch[2].toLowerCase()
    return {
      expr: `page.getByRole('${role}', { name: ${lit(roleMatch[1].trim())} })`,
      strategy: 'role',
    }
  }
  return { expr: `page.getByLabel(${lit(name)})`, strategy: 'label' }
}

/** Assert an element is disabled: "verify the Submit button is disabled". */
export const assertDisabledRule: StepRule = {
  name: 'assert-disabled',
  description: 'Asserts an element is disabled: "verify <element> is disabled/greyed out"',
  apply(step) {
    const match =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+is\s+(?:disabled|greyed out|grayed out|not\s+clickable)$/i.exec(
        step.trim(),
      )
    if (!match) return null
    const { expr, strategy } = elementLocator(match[1])
    return {
      lines: [`await expect(${expr}).toBeDisabled()`],
      strategies: [strategy],
      assumptions: [],
      confidence: 0.72,
    }
  },
}

/** Assert an element is enabled: "verify the Submit button is enabled". */
export const assertEnabledRule: StepRule = {
  name: 'assert-enabled',
  description: 'Asserts an element is enabled: "verify <element> is enabled/clickable"',
  apply(step) {
    const match =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+is\s+(?:enabled|clickable|active)$/i.exec(
        step.trim(),
      )
    if (!match) return null
    const { expr, strategy } = elementLocator(match[1])
    return {
      lines: [`await expect(${expr}).toBeEnabled()`],
      strategies: [strategy],
      assumptions: [],
      confidence: 0.72,
    }
  },
}

/** Assert a checkbox/radio is checked or unchecked. */
export const assertCheckedRule: StepRule = {
  name: 'assert-checked',
  description: 'Asserts checkbox state: "verify <name> is checked/unchecked/selected"',
  apply(step) {
    const s = step.trim()
    const unchecked =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+is\s+(?:unchecked|not\s+checked|not\s+selected|deselected)$/i.exec(
        s,
      )
    if (unchecked) {
      const name = unchecked[1].trim()
      return {
        lines: [`await expect(page.getByLabel(${lit(name)})).not.toBeChecked()`],
        strategies: ['label'],
        assumptions: [`Assumed "${name}" is a labelled checkbox/radio.`],
        confidence: 0.7,
      }
    }
    const checked =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+is\s+(?:checked|ticked|selected)$/i.exec(
        s,
      )
    if (checked) {
      const name = checked[1].trim()
      return {
        lines: [`await expect(page.getByLabel(${lit(name)})).toBeChecked()`],
        strategies: ['label'],
        assumptions: [`Assumed "${name}" is a labelled checkbox/radio.`],
        confidence: 0.7,
      }
    }
    return null
  },
}

/** Assert a field's value: "verify the Email field has value jane@test.com". */
export const assertValueRule: StepRule = {
  name: 'assert-value',
  description:
    'Asserts a field value: "verify <field> has value <value>", "<field> should equal <value>"',
  apply(step) {
    const match =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+(?:field\s+)?(?:has|contains|should\s+(?:have|contain|equal)|equals)\s+(?:the\s+)?value\s+(.+)$/i.exec(
        step.trim(),
      )
    if (!match) return null
    const field = match[1].trim()
    const value = match[2].trim()
    return {
      lines: [`await expect(page.getByLabel(${lit(field)})).toHaveValue(${lit(value)})`],
      strategies: ['label'],
      assumptions: [`Assumed "${field}" is an input reachable via getByLabel().`],
      confidence: 0.7,
    }
  },
}
