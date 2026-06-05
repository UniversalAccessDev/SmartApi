import { StepRule } from '../types'
import { lit } from '../../utils/literal'

const KEY_MAP: Record<string, string> = {
  enter: 'Enter',
  escape: 'Escape',
  esc: 'Escape',
  tab: 'Tab',
  space: 'Space',
  spacebar: 'Space',
  backspace: 'Backspace',
  delete: 'Delete',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  'arrow up': 'ArrowUp',
  'arrow down': 'ArrowDown',
  'arrow left': 'ArrowLeft',
  'arrow right': 'ArrowRight',
}

/**
 * Keyboard key press: "press Enter", "press the Escape key".
 * Must be registered before clickRule so "press Submit" (a button) falls
 * through to a click while real keys are handled here.
 */
export const pressKeyRule: StepRule = {
  name: 'press-key',
  description: 'Presses a keyboard key: "press Enter", "press Escape", "press the Tab key"',
  apply(step) {
    const match = /^press\s+(?:the\s+)?(.+?)(?:\s+key)?$/i.exec(step.trim())
    if (!match) return null

    const raw = match[1].trim().toLowerCase()
    const key = KEY_MAP[raw] ?? (raw.length === 1 ? raw.toUpperCase() : null)
    if (!key) return null // not a known key — let clickRule try

    return {
      lines: [`await page.keyboard.press(${lit(key)})`],
      strategies: ['keyboard'],
      assumptions: [],
      confidence: 0.9,
    }
  },
}

/** Hover over an element: "hover over the Profile menu". */
export const hoverRule: StepRule = {
  name: 'hover',
  description: 'Hovers over an element: "hover over <name>", "hover on <name>"',
  apply(step) {
    const match = /^hover\s+(?:over|on)?\s*(?:the\s+)?(.+)$/i.exec(step.trim())
    if (!match) return null

    const name = match[1].trim()
    return {
      lines: [`await page.getByText(${lit(name)}).hover()`],
      strategies: ['text'],
      assumptions: [`Assumed "${name}" is locatable via getByText() for hovering.`],
      confidence: 0.6,
    }
  },
}

/**
 * Close/dismiss an overlay. Honors the request's `closeOverlaysWithEscape`
 * flag: Escape key when enabled, otherwise a Close button click.
 */
export const closeOverlayRule: StepRule = {
  name: 'close-overlay',
  description:
    'Closes an overlay: "close the modal", "dismiss the dialog", "close popup" (uses Escape when closeOverlaysWithEscape is set)',
  apply(step, ctx) {
    const match =
      /^(?:close|dismiss)\s+(?:the\s+)?(.*?\b(?:modal|dialog|overlay|popup|popover|notification|toast|banner|drawer))?\b.*$/i.exec(
        step.trim(),
      )
    if (!match) return null

    if (ctx.closeOverlaysWithEscape) {
      return {
        lines: [`await page.keyboard.press('Escape')`],
        strategies: ['keyboard'],
        assumptions: ['Closed the overlay with the Escape key (closeOverlaysWithEscape enabled).'],
        confidence: 0.7,
      }
    }

    return {
      lines: [`await page.getByRole('button', { name: /close/i }).click()`],
      strategies: ['role'],
      assumptions: [
        'Assumed a Close button is present; enable closeOverlaysWithEscape to dismiss overlays with the Escape key instead.',
      ],
      confidence: 0.6,
    }
  },
}

const ROLE_SUFFIXES: Array<[RegExp, string]> = [
  [/\s+button$/i, 'button'],
  [/\s+link$/i, 'link'],
  [/\s+tab$/i, 'tab'],
  [/\s+checkbox$/i, 'checkbox'],
  [/\s+radio(?:\s+button)?$/i, 'radio'],
  [/\s+(?:menu item|menuitem)$/i, 'menuitem'],
  [/\s+option$/i, 'option'],
]

/**
 * Generic click — the fallback action rule. Infers an ARIA role from a
 * trailing noun ("Save button", "Docs link") and defaults to 'button'.
 */
export const clickRule: StepRule = {
  name: 'click',
  description: 'Clicks an element: "click <name>", "tap <name>", "click the <name> link/tab"',
  apply(step) {
    const match = /^(?:click|tap|hit|press)\s+(?:on\s+)?(?:the\s+)?(.+?)\s*$/i.exec(step.trim())
    if (!match) return null

    let name = match[1].trim().replace(/^["']|["']$/g, '')
    let role = 'button'
    let explicit = false

    for (const [suffix, mappedRole] of ROLE_SUFFIXES) {
      if (suffix.test(name)) {
        name = name.replace(suffix, '').trim()
        role = mappedRole
        explicit = true
        break
      }
    }

    return {
      lines: [`await page.getByRole(${lit(role)}, { name: ${lit(name)} }).click()`],
      strategies: ['role'],
      assumptions: explicit
        ? []
        : [
            `Assumed "${name}" is a button; if it is a link or menu item, change getByRole('button', ...) to the correct role.`,
          ],
      confidence: explicit ? 0.85 : 0.7,
    }
  },
}

/** Resolve a click-target phrase to a locator, inferring a role from a suffix. */
const targetLocator = (raw: string): string => {
  let name = raw.trim().replace(/^["']|["']$/g, '')
  for (const [suffix, role] of ROLE_SUFFIXES) {
    if (suffix.test(name)) {
      name = name.replace(suffix, '').trim()
      return `page.getByRole('${role}', { name: ${lit(name)} })`
    }
  }
  return `page.getByText(${lit(name)})`
}

/** Double-click: "double click X", "double-click the Row". */
export const doubleClickRule: StepRule = {
  name: 'double-click',
  description: 'Double-clicks an element: "double click <target>", "double-click the <target>"',
  apply(step) {
    const match = /^double[-\s]?click\s+(?:on\s+)?(?:the\s+)?(.+)$/i.exec(step.trim())
    if (!match) return null
    return {
      lines: [`await ${targetLocator(match[1])}.dblclick()`],
      strategies: ['text'],
      assumptions: [
        `Double-clicked "${match[1].trim()}"; adjust the locator if it is a specific role.`,
      ],
      confidence: 0.65,
    }
  },
}

/** Right-click (context menu): "right click X", "right-click the file". */
export const rightClickRule: StepRule = {
  name: 'right-click',
  description: 'Right-clicks an element: "right click <target>", "right-click the <target>"',
  apply(step) {
    const match = /^right[-\s]?click\s+(?:on\s+)?(?:the\s+)?(.+)$/i.exec(step.trim())
    if (!match) return null
    return {
      lines: [`await ${targetLocator(match[1])}.click({ button: 'right' })`],
      strategies: ['text'],
      assumptions: [
        `Right-clicked "${match[1].trim()}"; adjust the locator if it is a specific role.`,
      ],
      confidence: 0.65,
    }
  },
}

/** Search: "search for laptops", "search laptops in the search bar". */
export const searchRule: StepRule = {
  name: 'search',
  description: 'Searches: "search for <query>" — fills the search box and presses Enter',
  apply(step) {
    const match = /^search\s+(?:for\s+)?(.+?)(?:\s+in\s+.+)?$/i.exec(step.trim())
    if (!match) return null
    const query = match[1].trim()
    return {
      lines: [
        `await page.getByRole('searchbox').fill(${lit(query)})`,
        `await page.keyboard.press('Enter')`,
      ],
      strategies: ['role', 'keyboard'],
      assumptions: [
        `Assumed a search box with role "searchbox"; use getByPlaceholder('Search') if the field is a plain input.`,
      ],
      confidence: 0.62,
    }
  },
}

/** Scroll: "scroll to the footer", "scroll to bottom", "scroll down". */
export const scrollRule: StepRule = {
  name: 'scroll',
  description: 'Scrolls: "scroll to <target>", "scroll to bottom", "scroll down"',
  apply(step) {
    const s = step.trim()
    if (/^scroll\s+(?:to\s+(?:the\s+)?)?(?:bottom|end|down)$/i.test(s)) {
      return {
        lines: ['await page.mouse.wheel(0, 10000)'],
        strategies: ['keyboard'],
        assumptions: ['Scrolled the viewport down; adjust the distance if needed.'],
        confidence: 0.6,
      }
    }
    if (/^scroll\s+(?:to\s+(?:the\s+)?)?(?:top|up)$/i.test(s)) {
      return {
        lines: ['await page.mouse.wheel(0, -10000)'],
        strategies: ['keyboard'],
        assumptions: ['Scrolled the viewport up; adjust the distance if needed.'],
        confidence: 0.6,
      }
    }
    const toTarget = /^scroll\s+(?:down\s+)?to\s+(?:the\s+)?(.+)$/i.exec(s)
    if (toTarget) {
      const name = toTarget[1].trim()
      return {
        lines: [`await page.getByText(${lit(name)}).scrollIntoViewIfNeeded()`],
        strategies: ['text'],
        assumptions: [`Scrolled to "${name}" via getByText(); adjust the locator if ambiguous.`],
        confidence: 0.62,
      }
    }
    return null
  },
}

/** Focus a field: "focus the Email field", "focus on Search". */
export const focusRule: StepRule = {
  name: 'focus',
  description: 'Focuses a field: "focus the <field> field", "focus on <field>"',
  apply(step) {
    const match = /^focus\s+(?:on\s+)?(?:the\s+)?(.+?)(?:\s+(?:field|input|box))?$/i.exec(
      step.trim(),
    )
    if (!match) return null
    const field = match[1].trim()
    return {
      lines: [`await page.getByLabel(${lit(field)}).focus()`],
      strategies: ['label'],
      assumptions: [`Assumed "${field}" is an input reachable via getByLabel().`],
      confidence: 0.65,
    }
  },
}
