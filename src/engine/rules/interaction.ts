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

    // Modifier combos: "ctrl+a", "cmd+shift+p" -> "Control+A", "Meta+Shift+P".
    if (raw.includes('+')) {
      const MODIFIERS: Record<string, string> = {
        ctrl: 'Control',
        control: 'Control',
        cmd: 'Meta',
        command: 'Meta',
        meta: 'Meta',
        win: 'Meta',
        shift: 'Shift',
        alt: 'Alt',
        option: 'Alt',
      }
      const parts = raw.split('+').map((p) => p.trim())
      const hasModifier = parts.some((p) => MODIFIERS[p])
      if (hasModifier) {
        const combo = parts
          .map((p) => {
            if (MODIFIERS[p]) return MODIFIERS[p]
            if (KEY_MAP[p]) return KEY_MAP[p]
            return p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)
          })
          .join('+')
        return {
          lines: [`await page.keyboard.press(${lit(combo)})`],
          strategies: ['keyboard'],
          assumptions: [],
          confidence: 0.85,
        }
      }
    }

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

/** Search: "search for laptops", "search Indian food in the search bar". */
export const searchRule: StepRule = {
  name: 'search',
  description: 'Searches: "search for <query>" — fills the search box and presses Enter',
  apply(step) {
    // Only strip a trailing "in/using the search bar/box" — never a query that
    // happens to contain "in" (e.g. "Indian food in Los Angeles").
    const match =
      /^search\s+(?:for\s+)?(.+?)(?:\s+(?:in|using)\s+(?:the\s+)?search\s+(?:bar|box|field|input))?$/i.exec(
        step.trim(),
      )
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

/** Click by test id: "click the element with test id submit-btn", "click test id row-3". */
export const testIdClickRule: StepRule = {
  name: 'click-testid',
  description: 'Clicks by test id: "click the element with test id <id>", "click test id <id>"',
  apply(step) {
    const match =
      /^click\s+(?:on\s+)?(?:the\s+)?(?:element\s+with\s+)?test[\s-]?id\s+["']?(.+?)["']?$/i.exec(
        step.trim(),
      )
    if (!match) return null
    return {
      lines: [`await page.getByTestId(${lit(match[1].trim())}).click()`],
      strategies: ['testid'],
      assumptions: [],
      confidence: 0.85,
    }
  },
}

/** Click by visible text: "click on the text Welcome", "click the text Read more". */
export const textClickRule: StepRule = {
  name: 'click-text',
  description: 'Clicks by visible text: "click on the text <text>"',
  apply(step) {
    const match = /^click\s+(?:on\s+)?the\s+text\s+["']?(.+?)["']?$/i.exec(step.trim())
    if (!match) return null
    return {
      lines: [`await page.getByText(${lit(match[1].trim())}).click()`],
      strategies: ['text'],
      assumptions: [],
      confidence: 0.75,
    }
  },
}

const ORDINALS: Record<string, number> = {
  first: 0,
  '1st': 0,
  second: 1,
  '2nd': 1,
  third: 2,
  '3rd': 2,
  fourth: 3,
  '4th': 3,
  fifth: 4,
  '5th': 4,
}

/** Click the Nth match: "click the first result", "click the 3rd Add to Cart button". */
export const nthClickRule: StepRule = {
  name: 'click-nth',
  description: 'Clicks the Nth match: "click the first/second/last <target>"',
  apply(step) {
    const match =
      /^click\s+(?:on\s+)?the\s+(first|second|third|fourth|fifth|last|\d+(?:st|nd|rd|th)|1st|2nd|3rd)\s+(.+)$/i.exec(
        step.trim(),
      )
    if (!match) return null
    const ord = match[1].toLowerCase()
    const base = targetLocator(match[2])
    let selector: string
    if (ord === 'last') selector = `${base}.last()`
    else if (ord === 'first' || ord === '1st') selector = `${base}.first()`
    else if (ord in ORDINALS) selector = `${base}.nth(${ORDINALS[ord]})`
    else {
      const n = parseInt(ord, 10)
      selector = Number.isFinite(n) && n > 0 ? `${base}.nth(${n - 1})` : `${base}.first()`
    }
    return {
      lines: [`await ${selector}.click()`],
      strategies: ['text'],
      assumptions: [
        `Selected the "${ord}" match of "${match[2].trim()}"; verify the index/locator.`,
      ],
      confidence: 0.62,
    }
  },
}

/** Click an image: "click the logo image", "click the image". */
export const imageClickRule: StepRule = {
  name: 'click-image',
  description: 'Clicks an image: "click the <alt> image/logo/picture"',
  apply(step) {
    const match = /^click\s+(?:on\s+)?(?:the\s+)?(.*?)\s*(?:image|logo|picture)$/i.exec(step.trim())
    if (!match) return null
    const alt = match[1].trim().replace(/^(?:the|a|an)\s+/i, '')
    const locator = alt ? `page.getByAltText(${lit(alt)})` : `page.getByRole('img')`
    return {
      lines: [`await ${locator}.click()`],
      strategies: alt ? ['text'] : ['role'],
      assumptions: [alt ? `Assumed alt text "${alt}" for the image.` : 'Targeted the first image.'],
      confidence: 0.6,
    }
  },
}

/** Drag and drop: "drag X to Y", "drag and drop X onto Y". */
export const dragRule: StepRule = {
  name: 'drag',
  description: 'Drags one element onto another: "drag <source> to <target>"',
  apply(step) {
    const match =
      /^drag\s+(?:and\s+drop\s+)?(?:the\s+)?(.+?)\s+(?:to|onto|into|on)\s+(?:the\s+)?(.+)$/i.exec(
        step.trim(),
      )
    if (!match) return null
    const source = match[1].trim()
    const target = match[2].trim()
    return {
      lines: [`await page.getByText(${lit(source)}).dragTo(page.getByText(${lit(target)}))`],
      strategies: ['text'],
      assumptions: [
        `Dragged "${source}" onto "${target}" via getByText(); adjust the locators if they are specific roles.`,
      ],
      confidence: 0.6,
    }
  },
}

/** Expand/collapse a section: "expand the Details section", "collapse Advanced". */
export const expandCollapseRule: StepRule = {
  name: 'expand-collapse',
  description: 'Expands/collapses a section: "expand the <name> section", "collapse <name>"',
  apply(step) {
    const match =
      /^(?:expand|collapse|toggle)\s+(?:the\s+)?(.+?)(?:\s+(?:section|accordion|panel|menu|dropdown|group))?$/i.exec(
        step.trim(),
      )
    if (!match) return null
    const name = match[1].trim()
    return {
      lines: [`await page.getByRole('button', { name: ${lit(name)} }).click()`],
      strategies: ['role'],
      assumptions: [
        `Assumed "${name}" is an expandable control (button); adjust the role if needed.`,
      ],
      confidence: 0.6,
    }
  },
}

/** Handle a browser dialog: "accept the alert", "dismiss the confirmation". */
export const dialogRule: StepRule = {
  name: 'dialog',
  description: 'Handles native dialogs: "accept the alert", "dismiss the confirmation"',
  apply(step) {
    const match =
      /^(accept|confirm|dismiss|cancel)\s+(?:the\s+)?.*\b(?:alert|dialog|confirmation|prompt|popup)\b\s*$/i.exec(
        step.trim(),
      )
    if (!match) return null
    const action = /^(accept|confirm)$/i.test(match[1]) ? 'accept' : 'dismiss'
    return {
      lines: [`page.once('dialog', (dialog) => dialog.${action}())`],
      strategies: ['keyboard'],
      assumptions: [
        `Register this dialog handler BEFORE the step that triggers the ${match[1].toLowerCase()} dialog.`,
      ],
      confidence: 0.6,
    }
  },
}
