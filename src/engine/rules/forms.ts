import { StepRule } from '../types'
import { lit } from '../../utils/literal'

const labelAssumption = (field: string): string =>
  `Assumed the field "${field}" is reachable via getByLabel(); switch to getByPlaceholder() or getByRole() if it has no associated <label>.`

/**
 * Fill a form field. Supports several natural phrasings:
 *   - "Enter Full Name as Jane Doe"        (field, value)
 *   - "Fill Email with jane@test.com"      (field, value)
 *   - "Set Company to TestCo"              (field, value)
 *   - "Type Jane in the Name field"        (value, field)
 */
export const fillRule: StepRule = {
  name: 'fill',
  description:
    'Fills a field: "enter <field> as <value>", "fill <field> with <value>", "set <field> to <value>", "type <value> in <field>"',
  apply(step) {
    const s = step.trim()

    // field-first phrasings
    const fieldFirst =
      /^(?:enter|input)\s+(.+?)\s+as\s+(.+)$/i.exec(s) ||
      /^(?:fill(?:\s+in)?|set)\s+(.+?)\s+with\s+(.+)$/i.exec(s) ||
      /^set\s+(.+?)\s+to\s+(.+)$/i.exec(s)
    if (fieldFirst) {
      const field = fieldFirst[1].trim()
      const value = fieldFirst[2].trim()
      return {
        lines: [`await page.getByLabel(${lit(field)}).fill(${lit(value)})`],
        strategies: ['label'],
        assumptions: [labelAssumption(field)],
        confidence: 0.78,
      }
    }

    // value-first phrasing: "type <value> in/into the <field> field"
    const valueFirst =
      /^(?:type|enter|input)\s+(.+?)\s+(?:in|into)\s+(?:the\s+)?(.+?)(?:\s+field)?$/i.exec(s)
    if (valueFirst) {
      const value = valueFirst[1].trim()
      const field = valueFirst[2].trim()
      return {
        lines: [`await page.getByLabel(${lit(field)}).fill(${lit(value)})`],
        strategies: ['label'],
        assumptions: [labelAssumption(field)],
        confidence: 0.72,
      }
    }

    return null
  },
}

/** Check a checkbox/toggle: "check the Terms checkbox", "enable Notifications". */
export const checkRule: StepRule = {
  name: 'check',
  description: 'Checks a checkbox: "check <name>", "tick <name>", "enable <name>"',
  apply(step) {
    const match =
      /^(?:check|tick|enable)\s+(?:the\s+)?(.+?)(?:\s+(?:checkbox|toggle|option))?$/i.exec(
        step.trim(),
      )
    if (!match) return null

    const name = match[1].trim()
    return {
      lines: [`await page.getByLabel(${lit(name)}).check()`],
      strategies: ['label'],
      assumptions: [`Assumed "${name}" is a labelled checkbox/toggle.`],
      confidence: 0.7,
    }
  },
}

/** Uncheck a checkbox/toggle: "uncheck Remember me", "disable Notifications". */
export const uncheckRule: StepRule = {
  name: 'uncheck',
  description: 'Unchecks a checkbox: "uncheck <name>", "untick <name>", "disable <name>"',
  apply(step) {
    const match =
      /^(?:uncheck|untick|disable)\s+(?:the\s+)?(.+?)(?:\s+(?:checkbox|toggle|option))?$/i.exec(
        step.trim(),
      )
    if (!match) return null

    const name = match[1].trim()
    return {
      lines: [`await page.getByLabel(${lit(name)}).uncheck()`],
      strategies: ['label'],
      assumptions: [`Assumed "${name}" is a labelled checkbox/toggle.`],
      confidence: 0.7,
    }
  },
}

/** Select an option: "select Canada from Country", "choose Large in Size". */
export const selectRule: StepRule = {
  name: 'select-option',
  description:
    'Selects a dropdown option: "select <option> from <field>", "choose <option> in <field>"',
  apply(step) {
    const match =
      /^(?:select|choose|pick)\s+(.+?)\s+(?:from|in)\s+(?:the\s+)?(.+?)(?:\s+(?:dropdown|select|list|menu))?$/i.exec(
        step.trim(),
      )
    if (!match) return null

    const option = match[1].trim()
    const field = match[2].trim()
    return {
      lines: [`await page.getByLabel(${lit(field)}).selectOption(${lit(option)})`],
      strategies: ['label'],
      assumptions: [
        `Assumed "${field}" is a <select> reachable via getByLabel(); for custom dropdowns, click the trigger then the option instead.`,
      ],
      confidence: 0.7,
    }
  },
}
