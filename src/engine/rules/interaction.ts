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
