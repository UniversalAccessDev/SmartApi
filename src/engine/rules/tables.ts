import { StepRule } from '../types'
import { lit } from '../../utils/literal'

const ACTION_ROLE: Array<[RegExp, string]> = [
  [/\s+button$/i, 'button'],
  [/\s+link$/i, 'link'],
]

/** Resolve a row-action phrase ("Edit button", "Delete") to a scoped locator. */
const actionLocator = (raw: string): string => {
  let name = raw.trim().replace(/^["']|["']$/g, '')
  for (const [suffix, role] of ACTION_ROLE) {
    if (suffix.test(name)) {
      name = name.replace(suffix, '').trim()
      return `getByRole('${role}', { name: ${lit(name)} })`
    }
  }
  return `getByRole('button', { name: ${lit(name)} })`
}

/**
 * Act within a table row:
 *   "click Edit in the row for Jane Doe"
 *   "click the Delete button in the row containing alice@test.com"
 */
export const rowActionRule: StepRule = {
  name: 'row-action',
  description: 'Acts within a table row: "click <action> in the row for/containing <identifier>"',
  apply(step) {
    const match =
      /^click\s+(?:on\s+)?(?:the\s+)?(.+?)\s+(?:in|on|for)\s+the\s+row\s+(?:for|of|containing|with)\s+(.+)$/i.exec(
        step.trim(),
      )
    if (!match) return null
    const action = actionLocator(match[1])
    const rowName = match[2].trim()
    return {
      lines: [`await page.getByRole('row', { name: ${lit(rowName)} }).${action}.click()`],
      strategies: ['role'],
      assumptions: [
        `Scoped to the table row matching "${rowName}"; adjust if the row is identified differently.`,
      ],
      confidence: 0.7,
    }
  },
}

/**
 * Assert a row's contents:
 *   "verify the row for Jane Doe contains Active"
 *   "verify the row containing alice@test.com shows Admin"
 */
export const rowContainsRule: StepRule = {
  name: 'row-contains',
  description: 'Asserts a row contains text: "verify the row for <identifier> contains <text>"',
  apply(step) {
    const match =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?the\s+row\s+(?:for|of|containing|with)\s+(.+?)\s+(?:contains|shows|displays|has|should\s+(?:contain|show))\s+(?:the\s+)?(?:text\s+)?(.+)$/i.exec(
        step.trim(),
      )
    if (!match) return null
    const rowName = match[1].trim()
    const text = match[2].trim()
    return {
      lines: [
        `await expect(page.getByRole('row', { name: ${lit(rowName)} })).toContainText(${lit(text)})`,
      ],
      strategies: ['role'],
      assumptions: [`Scoped the assertion to the table row matching "${rowName}".`],
      confidence: 0.68,
    }
  },
}
