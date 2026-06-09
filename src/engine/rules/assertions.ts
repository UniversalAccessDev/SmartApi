import { StepRule } from '../types'
import { lit } from '../../utils/literal'
import { cleanLabel, cleanText, cleanValue, unquote } from '../text'

/** Assert the page URL: "verify url is X", "expect the url to contain X". */
export const assertUrlRule: StepRule = {
  name: 'assert-url',
  description: 'Asserts the page URL: "verify url is <url>", "url should contain <fragment>"',
  apply(step) {
    const s = step.trim()
    const match =
      /^(?:verify|assert|ensure|expect|check|make sure)\s+(?:that\s+)?(?:the\s+)?(?:page\s+)?url\s+(?:is|to be|equals|should be|contains|should contain)\s+(.+)$/i.exec(
        s,
      )
    // Redirect phrasings: "I get redirected to /login", "the page navigates to X".
    const redirect =
      /^(?:verify\s+(?:that\s+)?)?(?:i\s+(?:get|am)\s+redirected|i\s+am\s+(?:taken|sent)|(?:the\s+)?(?:page|url|browser)\s+(?:redirects?|navigates?|goes?|changes?))\s+to\s+(.+)$/i.exec(
        s,
      )
    const m = match || redirect
    if (!m) return null
    const target = cleanValue(m[1])
    const isContains = /contains?/.test(s.toLowerCase()) && Boolean(match)
    const matcher = isContains
      ? `toHaveURL(new RegExp(${lit(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))}))`
      : `toHaveURL(${lit(target)})`
    return {
      lines: [`await expect(page).${matcher}`],
      strategies: ['url'],
      assumptions: [],
      confidence: 0.82,
    }
  },
}

/** Assert the page title: "verify title is X". */
export const assertTitleRule: StepRule = {
  name: 'assert-title',
  description: 'Asserts the page title: "verify title is <title>"',
  apply(step) {
    const match =
      /^(?:verify|assert|ensure|expect|check)\s+(?:that\s+)?(?:the\s+)?(?:page\s+)?title\s+(is|to be|equals|should be|contains|should contain|includes)\s+(.+)$/i.exec(
        step.trim(),
      )
    if (!match) return null

    const op = match[1].toLowerCase()
    const value = cleanValue(match[2])
    const isContains = /contain|include/.test(op)
    const matcher = isContains
      ? `toHaveTitle(new RegExp(${lit(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))}, 'i'))`
      : `toHaveTitle(${lit(value)})`
    return {
      lines: [`await expect(page).${matcher}`],
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
      /^(?:verify|assert|ensure|confirm|check|make sure)\s+(?:that\s+)?(?:i (?:can )?see|we (?:can )?see|you (?:can )?see)\s+(.+)$/i,
      /^(?:i (?:can )?see|i should see)\s+(.+)$/i,
      /^(?:verify|assert|ensure|confirm|check|make sure)\s+(?:that\s+)?(.+?)\s+(?:appears?|is\s+(?:visible|displayed|present|shown)|shows up|exists)\b.*$/i,
      /^(.+?)\s+should\s+(?:be\s+visible|appear|be\s+displayed|be\s+present)$/i,
      // bare passive, no lead-in: 'The error message "X" is displayed'
      /^(.+?)\s+(?:is|are)\s+(?:visible|displayed|shown|present|on\s+(?:the\s+)?(?:screen|page))$/i,
      /^expect to see\s+(.+)$/i,
      /^see\s+(.+)$/i,
    ]

    for (const pattern of patterns) {
      const match = pattern.exec(s)
      if (match) {
        const text = cleanText(match[1])
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

/**
 * Locate an assertion "area" (the subject of the check). Known structural words
 * resolve to a role so "the heading reads X" targets the heading, not literal
 * text "heading". Everything else falls back to getByText().
 */
const AREA_ROLE: Record<string, string> = {
  heading: 'heading',
  header: 'heading',
  title: 'heading',
  alert: 'alert',
  dialog: 'dialog',
  modal: 'dialog',
}
const areaLocator = (raw: string): { expr: string; strategy: 'role' | 'text' } => {
  const area = cleanText(raw)
  const role = AREA_ROLE[area.toLowerCase()]
  if (role) return { expr: `page.getByRole('${role}')`, strategy: 'role' }
  return { expr: `page.getByText(${lit(area)})`, strategy: 'text' }
}

/**
 * Assert an element's text: "verify the header contains Welcome",
 * "the heading reads X", "the total shows $5", "the message says X exactly".
 * Uses toHaveText for exact phrasings (reads/says/equals/"exactly") and
 * toContainText for partial ("contains/includes/shows/displays").
 */
export const assertContainsRule: StepRule = {
  name: 'assert-contains-text',
  description: 'Asserts text content: "verify <area> contains/reads/shows <text>"',
  apply(step) {
    const exactMatch =
      /^(?:verify|assert|ensure|confirm|check|make sure)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+(?:reads?|says?|equals?|should\s+(?:read|say|equal)|is\s+exactly)\s+(?:exactly\s+)?(.+)$/i.exec(
        step.trim(),
      )
    const partialMatch =
      /^(?:verify|assert|ensure|confirm|check|make sure)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+(?:contains?|should\s+contain|includes?|shows?|displays?|has\s+the\s+text)\s+(?:the\s+)?(?:text\s+)?(.+)$/i.exec(
        step.trim(),
      )
    const match = exactMatch || partialMatch
    if (!match) return null
    const exact = Boolean(exactMatch) && /\bexactly\b/i.test(step)

    const area = cleanText(match[1])
    const text = cleanValue(match[2])
    // Input value-by-display: "the quantity input shows 3", "the Email field displays X"
    // -> toHaveValue (the subject is an input, not a text region).
    if (/\b(?:input|field|box|textbox|textarea)$/i.test(match[1].trim())) {
      const fieldName = cleanLabel(match[1])
      return {
        lines: [`await expect(page.getByLabel(${lit(fieldName)})).toHaveValue(${lit(text)})`],
        strategies: ['label'],
        assumptions: [`Assumed "${fieldName}" is an input reachable via getByLabel().`],
        confidence: 0.64,
      }
    }
    // Never fabricate a locator from a generic container noun ("the page displays
    // X"). Assert the (usually quoted) text is visible instead.
    if (/^(?:page|screen|window|site|app|application|ui|view|content|body)$/i.test(area)) {
      return {
        lines: [`await expect(page.getByText(${lit(text)})).toBeVisible()`],
        strategies: ['text'],
        assumptions: [
          `Asserted the text "${text}" is visible (the subject "${area}" is the whole page).`,
        ],
        confidence: 0.62,
      }
    }
    const { expr, strategy } = areaLocator(match[1])
    const matcher = exact ? `toHaveText(${lit(text)})` : `toContainText(${lit(text)})`
    return {
      lines: [`await expect(${expr}).${matcher}`],
      strategies: [strategy],
      assumptions:
        strategy === 'text'
          ? [
              `Assumed "${cleanText(match[1])}" is locatable via getByText(); adjust if it is a specific region/role.`,
            ]
          : [],
      confidence: strategy === 'role' ? 0.68 : 0.6,
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
    const s = step.trim()
    // Disappearance: "wait until the spinner disappears / modal closes / X is gone" -> toBeHidden.
    const gone =
      /^wait\s+(?:for|until)\s+(.+?)\s+(?:to\s+(?:disappear|vanish|go away|close|clear|hide|fade out)|disappears?|vanishes?|goes?\s+away|closes?|clears?|is\s+(?:gone|hidden|no\s+longer\s+visible))\b.*$/i.exec(
        s,
      )
    if (gone) {
      const text = cleanText(gone[1])
      return {
        lines: [`await expect(page.getByText(${lit(text)})).toBeHidden()`],
        strategies: ['text'],
        assumptions: [`Converted a wait into a web-first "hidden" assertion on "${text}".`],
        confidence: 0.65,
      }
    }
    // Async completion: "wait for the AJAX request to complete / partial refresh".
    if (
      /^wait\s+(?:for|until)\s+.*\b(?:ajax|request|network|partial\s+refresh|data\s+to\s+load|finish(?:es|ed)?\s+loading)\b/i.test(
        s,
      )
    ) {
      return {
        lines: [`await page.waitForLoadState('networkidle')`],
        strategies: [],
        assumptions: ['Interpreted as waiting for network idle.'],
        confidence: 0.6,
      }
    }
    const match =
      /^wait\s+(?:for|until)\s+(.+?)(?:\s+to\s+(?:appear|be\s+visible|load|show)|\s+(?:loads?|appears?|shows?|is\s+visible))?$/i.exec(
        s,
      )
    if (!match) return null

    const text = cleanText(match[1])
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
      /^(?:verify|assert|ensure|confirm|check|make sure)\s+(?:that\s+)?(.+?)\s+(?:is\s+(?:not\s+(?:visible|displayed|present|shown)|hidden|gone|removed)|disappears?|is\s+no\s+longer\s+(?:visible|present|shown))\b.*$/i,
      /^(.+?)\s+should\s+(?:disappear|not\s+be\s+visible|be\s+hidden|be\s+removed|be\s+gone)$/i,
      // "I should not see X", "we no longer see X", "you should not see X"
      /^(?:verify|assert|ensure|confirm|check|make sure)\s+(?:that\s+)?(?:i|we|you)\s+(?:should\s+)?(?:no\s+longer\s+see|(?:do\s+)?not\s+see|don't\s+see|can(?:'t|not)\s+see)\s+(.+)$/i,
      /^(?:i|we|you)\s+(?:should\s+)?(?:no\s+longer\s+see|(?:do\s+)?not\s+see|don't\s+see|can(?:'t|not)\s+see)\s+(.+)$/i,
    ]
    for (const pattern of patterns) {
      const match = pattern.exec(s)
      if (match) {
        const text = cleanText(match[1])
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
  // Peel a trailing role suffix BEFORE cleaning, so a quoted name keeps its role.
  const roleMatch = /^(.*?)\s+(button|link|tab|checkbox|menuitem|radio)$/i.exec(raw.trim())
  if (roleMatch) {
    const role = roleMatch[2].toLowerCase()
    return {
      expr: `page.getByRole('${role}', { name: ${lit(cleanLabel(roleMatch[1]))} })`,
      strategy: 'role',
    }
  }
  return { expr: `page.getByLabel(${lit(cleanLabel(raw))})`, strategy: 'label' }
}

/** Assert an element is disabled: "verify the Submit button is disabled". */
export const assertDisabledRule: StepRule = {
  name: 'assert-disabled',
  description: 'Asserts an element is disabled: "verify <element> is disabled/greyed out"',
  apply(step) {
    const s = step.trim()
    const STATE = '(?:disabled|greyed out|grayed out|not\\s+clickable|not\\s+enabled|inactive)'
    const match =
      new RegExp(
        `^(?:verify|assert|ensure|confirm|check|make sure)\\s+(?:that\\s+)?(?:the\\s+)?(.+?)\\s+is\\s+${STATE}$`,
        'i',
      ).exec(s) ||
      new RegExp(`^(?:the\\s+)?(.+?)\\s+should\\s+(?:be|stay|remain)\\s+${STATE}$`, 'i').exec(s)
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
    const s = step.trim()
    const STATE = '(?:enabled|clickable|active|not\\s+disabled)'
    const match =
      new RegExp(
        `^(?:verify|assert|ensure|confirm|check|make sure)\\s+(?:that\\s+)?(?:the\\s+)?(.+?)\\s+is\\s+${STATE}$`,
        'i',
      ).exec(s) ||
      new RegExp(`^(?:the\\s+)?(.+?)\\s+should\\s+(?:be|become)\\s+${STATE}$`, 'i').exec(s)
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
      const name = cleanLabel(unchecked[1])
      return {
        lines: [`await expect(page.getByLabel(${lit(name)})).not.toBeChecked()`],
        strategies: ['label'],
        assumptions: [`Assumed "${name}" is a labelled checkbox/radio.`],
        confidence: 0.7,
      }
    }
    const checked =
      /^(?:verify|assert|ensure|confirm|check|make sure)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+is\s+(?:checked|ticked|selected|active)$/i.exec(
        s,
      )
    if (checked) {
      // "the Reports tab is selected/active" -> aria-selected on a tab.
      const tab = /^(.*?)\s+tab$/i.exec(checked[1].trim())
      if (tab) {
        const name = cleanLabel(tab[1])
        return {
          lines: [
            `await expect(page.getByRole('tab', { name: ${lit(name)} })).toHaveAttribute('aria-selected', 'true')`,
          ],
          strategies: ['role'],
          assumptions: [`Assumed "${name}" is a tab; checked aria-selected.`],
          confidence: 0.66,
        }
      }
      const name = cleanLabel(checked[1])
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
    const field = cleanLabel(match[1])
    const value = cleanValue(match[2])
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
        `await expect(page.getByRole('heading', { name: ${lit(unquote(match[1]))} })).toBeVisible()`,
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
      /^(?:verify|assert|ensure|confirm|check|make sure)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+(?:field\s+)?is\s+(?:focused|active|highlighted|in\s+focus)$/i.exec(
        s,
      ) || /^(.+?)\s+should\s+(?:be\s+focused|have\s+focus)$/i.exec(s)
    if (!m) return null
    const field = cleanLabel(m[1])
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
      /^(?:verify|assert|ensure|confirm|check|make sure)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+(?:field\s+)?is\s+(?:empty|blank|cleared|has\s+no\s+\w+)$/i.exec(
        step.trim(),
      )
    if (!match) return null
    const subject = cleanLabel(match[1])
    // A collection being "empty" is a count assertion, not an input value.
    const COLLECTION: Record<string, string> = {
      table: 'row',
      grid: 'row',
      list: 'listitem',
      results: 'listitem',
      'results list': 'listitem',
      'search results': 'listitem',
    }
    const role = COLLECTION[subject.toLowerCase()]
    if (role) {
      return {
        lines: [`await expect(page.getByRole('${role}')).toHaveCount(0)`],
        strategies: ['role'],
        assumptions: [`Asserted no ${role}s; if a header row is present, expect 1 instead of 0.`],
        confidence: 0.62,
      }
    }
    if (/^(?:cart|basket|bag|inbox)$/i.test(subject)) {
      return {
        lines: [`await expect(page.getByText(/empty|no items|nothing/i)).toBeVisible()`],
        strategies: ['text'],
        assumptions: [`Asserted an empty-state message for the ${subject}.`],
        confidence: 0.55,
      }
    }
    return {
      lines: [`await expect(page.getByLabel(${lit(subject)})).toHaveValue('')`],
      strategies: ['label'],
      assumptions: [`Assumed "${subject}" is an input reachable via getByLabel().`],
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
    // "the password field has type password", "the email input has placeholder ..."
    const namedAttr =
      /^(?:verify|assert|ensure|confirm|check|make sure)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+(?:has|should\s+have)\s+(type|placeholder|name|role|aria-label|title|value|maxlength|pattern)\s+(?:of\s+|=\s*|set\s+to\s+)?(.+)$/i.exec(
        step.trim(),
      )
    if (namedAttr) {
      const field = cleanLabel(namedAttr[1])
      const attrName = namedAttr[2].toLowerCase()
      const attrVal = cleanValue(namedAttr[3])
      const matcher =
        attrName === 'value'
          ? `toHaveValue(${lit(attrVal)})`
          : `toHaveAttribute(${lit(attrName)}, ${lit(attrVal)})`
      return {
        lines: [`await expect(page.getByLabel(${lit(field)})).${matcher}`],
        strategies: ['label'],
        assumptions: [`Assumed "${field}" is reachable via getByLabel().`],
        confidence: 0.66,
      }
    }
    // boolean states: "the email field is readonly/required/editable"
    const boolAttr =
      /^(?:verify|assert|ensure|confirm|check|make sure)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+is\s+(read-?only|required|editable|optional)$/i.exec(
        step.trim(),
      )
    if (boolAttr) {
      const field = cleanLabel(boolAttr[1])
      const state = boolAttr[2].toLowerCase().replace('-', '')
      const editable = state === 'editable'
      const optional = state === 'optional'
      const matcher = editable
        ? 'toBeEditable()'
        : optional
          ? `not.toHaveAttribute('required', '')`
          : state === 'readonly'
            ? `toHaveAttribute('readonly', '')`
            : `toHaveAttribute('required', '')`
      return {
        lines: [`await expect(page.getByLabel(${lit(field)})).${matcher}`],
        strategies: ['label'],
        assumptions: [`Assumed "${field}" is reachable via getByLabel().`],
        confidence: 0.64,
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
  products: 'listitem',
  cards: 'listitem',
  results: 'listitem',
  entries: 'row',
  records: 'row',
  'search results': 'listitem',
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
      /^(?:(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?)?the\s+(?:table|list|grid)\s+(?:has|should\s+have|should\s+contain|contains)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(rows|items|cells|options)$/i.exec(
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

    // Comparators: "at least 10 rows", "more than 3 items", "fewer than 5 options".
    const cmp =
      /^(?:verify|assert|ensure|confirm|check|make sure)\s+(?:that\s+)?(?:the\s+(?:table|list|grid|results(?:\s+table)?)\s+(?:has|contains?|should\s+(?:have|contain))\s+|there\s+(?:are|should\s+be)\s+)?(at least|at most|more than|over|fewer than|less than|no more than|no fewer than|a minimum of|a maximum of)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(rows|items|list items|options|links|buttons|images|headings|cells|tabs|checkboxes|results)\b.*$/i.exec(
        s,
      )
    if (cmp) {
      const n = num(cmp[2])
      const role =
        COUNT_ROLE[cmp[3].toLowerCase()] ?? (cmp[3].toLowerCase() === 'results' ? 'listitem' : null)
      if (n !== null && role) {
        const op = cmp[1].toLowerCase()
        let line: string
        if (/at least|no fewer than|a minimum of/.test(op)) {
          line = `await expect(page.getByRole('${role}').nth(${n - 1})).toBeVisible()`
        } else if (/more than|over/.test(op)) {
          line = `await expect(page.getByRole('${role}').nth(${n})).toBeVisible()`
        } else if (/at most|no more than|a maximum of/.test(op)) {
          line = `await expect(page.getByRole('${role}').nth(${n})).toHaveCount(0)`
        } else {
          // fewer than / less than N
          line = `await expect(page.getByRole('${role}').nth(${n - 1})).toHaveCount(0)`
        }
        return {
          lines: [line],
          strategies: ['role'],
          assumptions: [
            `Approximated a "${op}" count check via an indexed visibility assertion on getByRole('${role}').`,
          ],
          confidence: 0.6,
        }
      }
    }

    const nThings =
      /^(?:verify|assert|ensure|confirm|check|make sure)\s+(?:that\s+)?(?:there\s+(?:are|should\s+be)\s+|i\s+see\s+)?(?:exactly\s+|only\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(rows|items|list items|options|links|buttons|images|headings|cells|tabs|checkboxes|products|cards|results|entries|records|search results)\s+(?:are\s+|should\s+be\s+)?(?:visible|shown|listed|displayed|present|in\s+(?:the\s+)?(?:list|table|results|grid))?$/i.exec(
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
