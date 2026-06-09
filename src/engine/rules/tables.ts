import { StepRule } from '../types'
import { lit } from '../../utils/literal'
import { unquote } from '../text'

const ACTION_ROLE: Array<[RegExp, string]> = [
  [/\s+button$/i, 'button'],
  [/\s+link$/i, 'link'],
  [/\s+(?:checkbox|tickbox)$/i, 'checkbox'],
  [/\s+icon$/i, 'button'],
]

// Word/numeric ordinal -> zero-based index for "the Nth row" phrasings.
const ORDINAL_INDEX: Record<string, number> = {
  first: 0,
  second: 1,
  third: 2,
  fourth: 3,
  fifth: 4,
  sixth: 5,
  seventh: 6,
  eighth: 7,
  ninth: 8,
  tenth: 9,
}

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
    const s = step.trim()
    // Connector words that introduce a row identifier.
    const REL =
      '(?:for|of|containing|that\\s+contains|that\\s+has|which\\s+contains|with|where(?:\\s+\\w+\\s+is)?)'
    // Card/tile scope: "click the Delete button on the card for Jane Doe".
    const card =
      /^(?:click|press|tap)\s+(?:on\s+)?(?:the\s+)?(.+?)\s+(?:in|on|for)\s+the\s+(?:card|tile|panel)\s+(?:for|of|titled|labell?ed|containing|with|that\s+contains)\s+(.+)$/i.exec(
        s,
      )
    if (card) {
      const id = unquote(card[2])
      return {
        lines: [
          `await page.locator('[role="listitem"], .card', { hasText: ${lit(id)} }).first().${actionLocator(card[1])}.click()`,
        ],
        strategies: ['css', 'role'],
        assumptions: [
          `Scoped to the card/tile containing "${id}"; adjust the container selector to the app.`,
        ],
        confidence: 0.6,
      }
    }
    // Proximity: "click Approve next to John Smith" -> row containing the id.
    const proximity =
      /^(?:click|press|tap|select|check)\s+(?:on\s+)?(?:the\s+)?(.+?)\s+(?:next\s+to|beside|alongside)\s+(.+)$/i.exec(
        s,
      )
    // Trailing-scope: "click Edit in the row for Jane Doe"
    const trailing = new RegExp(
      `^click\\s+(?:on\\s+)?(?:the\\s+)?(.+?)\\s+(?:in|on|for)\\s+(?:the\\s+)?row\\s+${REL}\\s+(.+)$`,
      'i',
    ).exec(s)
    // Leading-scope: "in the row for Jane Doe, click Edit"
    const leading = new RegExp(
      `^(?:in|on|within|for)\\s+(?:the\\s+)?row\\s+${REL}\\s+(.+?)\\s*,?\\s+(?:click|press|tap|select|check)\\s+(?:on\\s+)?(?:the\\s+)?(.+)$`,
      'i',
    ).exec(s)
    // Possessive: "click Edit on Jane Doe's row"
    const possessive =
      /^click\s+(?:on\s+)?(?:the\s+)?(.+?)\s+(?:in|on|for)\s+(.+?)['’]s\s+row$/i.exec(s)
    // Ordinal-scope: "click Edit in the second row", "press Delete in the 3rd row"
    const ordinalScope =
      /^(?:click|press|tap|select|check)\s+(?:on\s+)?(?:the\s+)?(.+?)\s+(?:in|on)\s+the\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|\d+(?:st|nd|rd|th))\s+row(?:\s+of\s+the\s+table)?$/i.exec(
        s,
      )
    // User/order scope: "for the user alice@test.com, press Deactivate"
    const entityScope =
      /^(?:for|in)\s+(?:the\s+)?(?:user|order|customer|account|item|product)\s+(.+?)\s*,?\s+(?:click|press|tap|select|check)\s+(?:on\s+)?(?:the\s+)?(.+)$/i.exec(
        s,
      )

    let action: string
    let rowName: string
    if (ordinalScope) {
      const ord = ordinalScope[2].toLowerCase()
      const idx =
        ord === 'last'
          ? '.last()'
          : `.nth(${ORDINAL_INDEX[ord] ?? Math.max(0, parseInt(ord, 10) - 1)})`
      return {
        lines: [`await page.getByRole('row')${idx}.${actionLocator(ordinalScope[1])}.click()`],
        strategies: ['role'],
        assumptions: [`Scoped to the "${ord}" table row.`],
        confidence: 0.68,
      }
    } else if (entityScope) {
      action = actionLocator(entityScope[2])
      rowName = unquote(entityScope[1])
    } else if (trailing) {
      action = actionLocator(trailing[1])
      rowName = unquote(trailing[2])
    } else if (leading) {
      rowName = unquote(leading[1])
      action = actionLocator(leading[2])
    } else if (possessive) {
      action = actionLocator(possessive[1])
      rowName = unquote(possessive[2])
    } else if (proximity) {
      action = actionLocator(proximity[1])
      rowName = unquote(proximity[2])
    } else {
      return null
    }
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
    const s = step.trim()
    const VERB = '(?:contains?|shows?|displays?|has|should\\s+(?:contain|show))'
    const match = new RegExp(
      `^(?:verify|assert|ensure|confirm|check|make sure)\\s+(?:that\\s+)?the\\s+row\\s+(?:for|of|containing|with)\\s+(.+?)\\s+${VERB}\\s+(?:the\\s+)?(?:text\\s+)?(.+)$`,
      'i',
    ).exec(s)
    // Ordinal row: "verify the 3rd row contains Pending"
    const ordinal = new RegExp(
      `^(?:verify|assert|ensure|confirm|check|make sure)\\s+(?:that\\s+)?the\\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|\\d+(?:st|nd|rd|th))\\s+row\\s+${VERB}\\s+(?:the\\s+)?(?:text\\s+)?(.+)$`,
      'i',
    ).exec(s)
    if (ordinal) {
      const ord = ordinal[1].toLowerCase()
      const text = unquote(ordinal[2])
      const idx =
        ord === 'last'
          ? '.last()'
          : `.nth(${ORDINAL_INDEX[ord] ?? Math.max(0, parseInt(ord, 10) - 1)})`
      return {
        lines: [`await expect(page.getByRole('row')${idx}).toContainText(${lit(text)})`],
        strategies: ['role'],
        assumptions: [`Scoped the assertion to the "${ord}" table row.`],
        confidence: 0.66,
      }
    }
    if (!match) return null
    const rowName = unquote(match[1])
    const text = unquote(match[2])
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
