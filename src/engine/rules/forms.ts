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

/**
 * Fill by placeholder text:
 *   "type jane in the Name placeholder"
 *   "enter laptops into the Search placeholder"
 *   "fill the Email placeholder with jane@test.com"
 */
export const placeholderFillRule: StepRule = {
  name: 'fill-placeholder',
  description: 'Fills by placeholder: "type <value> in the <placeholder> placeholder"',
  apply(step) {
    const s = step.trim()
    const valueFirst =
      /^(?:type|enter|input)\s+(.+?)\s+(?:in|into)\s+(?:the\s+)?(.+?)\s+placeholder$/i.exec(s)
    if (valueFirst) {
      return {
        lines: [
          `await page.getByPlaceholder(${lit(valueFirst[2].trim())}).fill(${lit(valueFirst[1].trim())})`,
        ],
        strategies: ['placeholder'],
        assumptions: [],
        confidence: 0.75,
      }
    }
    const fieldFirst = /^fill\s+(?:the\s+)?(.+?)\s+placeholder\s+with\s+(.+)$/i.exec(s)
    if (fieldFirst) {
      return {
        lines: [
          `await page.getByPlaceholder(${lit(fieldFirst[1].trim())}).fill(${lit(fieldFirst[2].trim())})`,
        ],
        strategies: ['placeholder'],
        assumptions: [],
        confidence: 0.75,
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

/** Select a radio button: "select the Male radio button", "choose Yes radio". */
export const radioRule: StepRule = {
  name: 'radio',
  description: 'Selects a radio button: "select <name> radio [button]", "choose the <name> radio"',
  apply(step) {
    const match = /^(?:select|choose|pick|check)\s+(?:the\s+)?(.+?)\s+radio(?:\s+button)?$/i.exec(
      step.trim(),
    )
    if (!match) return null
    const name = match[1].trim()
    return {
      lines: [`await page.getByLabel(${lit(name)}).check()`],
      strategies: ['label'],
      assumptions: [`Assumed "${name}" is a labelled radio button.`],
      confidence: 0.72,
    }
  },
}

/** Clear an input: "clear the Email field", "empty the search box". */
export const clearFieldRule: StepRule = {
  name: 'clear-field',
  description: 'Clears an input: "clear the <field> field", "empty <field>"',
  apply(step) {
    const match = /^(?:clear|empty)\s+(?:the\s+)?(.+?)(?:\s+(?:field|input|box))?$/i.exec(
      step.trim(),
    )
    if (!match) return null
    const field = match[1].trim()
    return {
      lines: [`await page.getByLabel(${lit(field)}).clear()`],
      strategies: ['label'],
      assumptions: [`Assumed "${field}" is an input reachable via getByLabel().`],
      confidence: 0.72,
    }
  },
}

/** Upload a file: "upload resume.pdf to Resume", "upload photo.png". */
export const fileUploadRule: StepRule = {
  name: 'file-upload',
  description: 'Uploads a file: "upload <file> to <field>", "upload <file>"',
  apply(step) {
    const withField =
      /^(?:upload|attach)\s+(.+?)\s+(?:to|into|in)\s+(?:the\s+)?(.+?)(?:\s+field)?$/i.exec(
        step.trim(),
      )
    if (withField) {
      const file = withField[1].trim()
      const field = withField[2].trim()
      return {
        lines: [`await page.getByLabel(${lit(field)}).setInputFiles(${lit(file)})`],
        strategies: ['label'],
        assumptions: [
          `Assumed the upload field "${field}" is reachable via getByLabel(); provide the real file path for "${file}".`,
        ],
        confidence: 0.65,
      }
    }
    const simple = /^(?:upload|attach)\s+(?:the\s+)?(?:file\s+)?(.+)$/i.exec(step.trim())
    if (simple) {
      const file = simple[1].trim()
      return {
        lines: [`await page.locator('input[type="file"]').setInputFiles(${lit(file)})`],
        strategies: ['label'],
        assumptions: [
          `No upload field named — targeted the first file input on the page; provide the real path for "${file}".`,
        ],
        confidence: 0.55,
      }
    }
    return null
  },
}
