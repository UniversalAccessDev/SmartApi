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

/** Assert a heading is visible: "verify the heading Welcome is visible". */
export const assertHeadingRule: StepRule = {
  name: 'assert-heading',
  description: 'Asserts a heading: "verify the heading <text> is visible/appears"',
  apply(step) {
    const match =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:the\s+)?(?:heading|title|header)\s+["']?(.+?)["']?\s+(?:is\s+(?:visible|displayed|shown)|appears?)$/i.exec(
        step.trim(),
      )
    if (!match) return null
    return {
      lines: [
        `await expect(page.getByRole('heading', { name: ${lit(match[1].trim())} })).toBeVisible()`,
      ],
      strategies: ['role'],
      assumptions: [],
      confidence: 0.74,
    }
  },
}

/** Assert an image is visible: "verify the logo image is visible". */
export const assertImageRule: StepRule = {
  name: 'assert-image',
  description: 'Asserts an image: "verify the <alt> image is visible"',
  apply(step) {
    const match =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:the\s+)?(.*?)\s*(?:image|logo|picture)\s+(?:is\s+(?:visible|displayed|shown)|appears?)$/i.exec(
        step.trim(),
      )
    if (!match) return null
    const alt = match[1].trim().replace(/^(?:the|a|an)\s+/i, '')
    const locator = alt ? `page.getByAltText(${lit(alt)})` : `page.getByRole('img')`
    return {
      lines: [`await expect(${locator}).toBeVisible()`],
      strategies: alt ? ['text'] : ['role'],
      assumptions: alt
        ? [`Assumed alt text "${alt}" for the image.`]
        : ['Targeted the first image.'],
      confidence: 0.66,
    }
  },
}

/** Assert a field is focused: "verify the Email field is focused". */
export const assertFocusedRule: StepRule = {
  name: 'assert-focused',
  description: 'Asserts focus: "verify <field> is focused", "<field> should be focused"',
  apply(step) {
    const s = step.trim()
    const m =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+(?:field\s+)?is\s+(?:focused|active|highlighted)$/i.exec(
        s,
      ) || /^(.+?)\s+should\s+be\s+focused$/i.exec(s)
    if (!m) return null
    const field = m[1].trim()
    return {
      lines: [`await expect(page.getByLabel(${lit(field)})).toBeFocused()`],
      strategies: ['label'],
      assumptions: [`Assumed "${field}" is an input reachable via getByLabel().`],
      confidence: 0.68,
    }
  },
}

/** Assert a field is empty: "verify the Search field is empty". */
export const assertEmptyRule: StepRule = {
  name: 'assert-empty',
  description: 'Asserts an input is empty: "verify the <field> field is empty"',
  apply(step) {
    const match =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+(?:field\s+)?is\s+(?:empty|blank|cleared)$/i.exec(
        step.trim(),
      )
    if (!match) return null
    const field = match[1].trim()
    return {
      lines: [`await expect(page.getByLabel(${lit(field)})).toHaveValue('')`],
      strategies: ['label'],
      assumptions: [`Assumed "${field}" is an input reachable via getByLabel().`],
      confidence: 0.68,
    }
  },
}

/** Assert an attribute: "verify the Docs link has href /docs". */
export const assertAttributeRule: StepRule = {
  name: 'assert-attribute',
  description: 'Asserts an attribute: "verify the <name> link has href <value>"',
  apply(step) {
    const href =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+link\s+(?:has|should\s+have)\s+href\s+(.+)$/i.exec(
        step.trim(),
      )
    if (href) {
      return {
        lines: [
          `await expect(page.getByRole('link', { name: ${lit(href[1].trim())} })).toHaveAttribute('href', ${lit(href[2].trim())})`,
        ],
        strategies: ['role'],
        assumptions: [],
        confidence: 0.72,
      }
    }
    const attr =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+has\s+attribute\s+(\S+)\s+(?:=|equal\s+to|of|set\s+to)\s+(.+)$/i.exec(
        step.trim(),
      )
    if (attr) {
      return {
        lines: [
          `await expect(page.getByText(${lit(attr[1].trim())})).toHaveAttribute(${lit(attr[2].trim())}, ${lit(attr[3].trim())})`,
        ],
        strategies: ['text'],
        assumptions: [
          `Assumed "${attr[1].trim()}" is locatable via getByText(); adjust if it is a specific role.`,
        ],
        confidence: 0.6,
      }
    }
    return null
  },
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
}

// Plural nouns mapped to ARIA roles for count assertions.
const COUNT_ROLE: Record<string, string> = {
  rows: 'row',
  items: 'listitem',
  'list items': 'listitem',
  options: 'option',
  links: 'link',
  buttons: 'button',
  images: 'img',
  headings: 'heading',
  cells: 'cell',
  tabs: 'tab',
  checkboxes: 'checkbox',
}

/**
 * Assert a count of elements:
 *   "verify the table has 5 rows"
 *   "verify 3 items are visible"
 */
export const assertCountRule: StepRule = {
  name: 'assert-count',
  description: 'Asserts a count: "verify the table has <N> rows", "verify <N> items are visible"',
  apply(step) {
    const s = step.trim()
    const num = (raw: string): number | null => {
      const n = NUMBER_WORDS[raw.toLowerCase()] ?? parseInt(raw, 10)
      return Number.isFinite(n) ? n : null
    }

    const hasN =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?the\s+(?:table|list|grid)\s+has\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(rows|items|cells|options)$/i.exec(
        s,
      )
    if (hasN) {
      const n = num(hasN[1])
      const role = COUNT_ROLE[hasN[2].toLowerCase()]
      if (n !== null && role) {
        return {
          lines: [`await expect(page.getByRole('${role}')).toHaveCount(${n})`],
          strategies: ['role'],
          assumptions:
            role === 'row'
              ? ['Row count includes the header row if present; adjust if needed.']
              : [],
          confidence: 0.66,
        }
      }
    }

    const nThings =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:there\s+are\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(rows|items|list items|options|links|buttons|images|headings|cells|tabs|checkboxes)\s+(?:are\s+)?(?:visible|shown|listed|displayed|present)$/i.exec(
        s,
      )
    if (nThings) {
      const n = num(nThings[1])
      const role = COUNT_ROLE[nThings[2].toLowerCase()]
      if (n !== null && role) {
        return {
          lines: [`await expect(page.getByRole('${role}')).toHaveCount(${n})`],
          strategies: ['role'],
          assumptions: [],
          confidence: 0.64,
        }
      }
    }
    return null
  },
}
