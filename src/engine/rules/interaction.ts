import { StepRule } from '../types'
import { lit } from '../../utils/literal'
import { slugify } from '../../utils/slug'
import { unquote, extractQuoted, stripFiller, iconAffordance } from '../text'

// Bare role nouns → ARIA role (for "click the first <noun>" / nth selection).
const ROLE_NOUNS: Record<string, string> = {
  tab: 'tab',
  tabs: 'tab',
  row: 'row',
  rows: 'row',
  item: 'listitem',
  items: 'listitem',
  option: 'option',
  options: 'option',
  cell: 'cell',
  cells: 'cell',
  link: 'link',
  links: 'link',
  button: 'button',
  buttons: 'button',
  checkbox: 'checkbox',
  checkboxes: 'checkbox',
  heading: 'heading',
  headings: 'heading',
  image: 'img',
  images: 'img',
}

const KEY_MAP: Record<string, string> = {
  enter: 'Enter',
  return: 'Enter',
  escape: 'Escape',
  esc: 'Escape',
  tab: 'Tab',
  space: 'Space',
  spacebar: 'Space',
  'space bar': 'Space',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  'page up': 'PageUp',
  pagedown: 'PageDown',
  'page down': 'PageDown',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  'arrow up': 'ArrowUp',
  'arrow down': 'ArrowDown',
  'arrow left': 'ArrowLeft',
  'arrow right': 'ArrowRight',
  'up arrow': 'ArrowUp',
  'down arrow': 'ArrowDown',
  'left arrow': 'ArrowLeft',
  'right arrow': 'ArrowRight',
  f1: 'F1',
  f2: 'F2',
  f3: 'F3',
  f4: 'F4',
  f5: 'F5',
  f6: 'F6',
  f7: 'F7',
  f8: 'F8',
  f9: 'F9',
  f10: 'F10',
  f11: 'F11',
  f12: 'F12',
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
    const match = /^(?:press|hit|tap|type|push)\s+(?:the\s+)?(.+?)(?:\s+key)?$/i.exec(step.trim())
    if (!match) return null

    let raw = match[1].trim().toLowerCase()
    // Drop trailing prose so "Cmd+C to copy the text" / "F5 key to refresh" keep
    // only the key token, and "Enter twice" ignores the repeat count.
    raw = raw
      .replace(/\s+key\b.*$/, '')
      .replace(/\s+(?:to|in order to|so that|which|and then|then|on)\b.*$/, '')
      .replace(/\s+(?:once|twice|\d+\s+times|x\s*\d+)\b.*$/, '')
      .replace(/\s+(?:together|simultaneously|at once)\b.*$/, '')
      .replace(/\s+plus\s+/g, '+') // "control plus c" -> "control+c"
      .replace(/\b(ctrl|control|cmd|command|meta|win|shift|alt|option)\s+and\s+/g, '$1+')
      .trim()

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

/**
 * Clipboard & select-all shortcuts: "copy the text", "paste", "select all",
 * "cut the selection" -> keyboard.press(Control+c/v/x/a). Registered before
 * clickRule so these never become a button click.
 */
export const clipboardRule: StepRule = {
  name: 'clipboard',
  description: 'Clipboard/select-all shortcuts: "copy", "paste", "cut", "select all"',
  apply(step) {
    const s = step.trim()
    if (/^(?:select|highlight)\s+(?:all|everything)(?:\s+(?:the\s+)?text)?$/i.test(s)) {
      return mod('a', 'Selected all with Control+a.')
    }
    if (
      /^copy\b(?:\s+(?:the\s+)?(?:selected\s+)?(?:text|selection|highlighted\s+text|link|url))?$/i.test(
        s,
      )
    ) {
      return mod('c', 'Copied with Control+c.')
    }
    if (/^cut\b(?:\s+(?:the\s+)?(?:selected\s+)?(?:text|selection))?$/i.test(s)) {
      return mod('x', 'Cut with Control+x.')
    }
    if (/^paste\b(?:\s+(?:it|the\s+(?:text|value|clipboard)))?(?:\s+(?:in|into)\b.*)?$/i.test(s)) {
      return mod('v', 'Pasted with Control+v.')
    }
    return null
  },
}

const mod = (key: string, note: string): ReturnType<StepRule['apply']> => ({
  lines: [`await page.keyboard.press('Control+${key}')`],
  strategies: ['keyboard'],
  assumptions: [`${note} Use 'Meta+${key}' on macOS-specific runs.`],
  confidence: 0.7,
})

/** Hover over an element: "hover over the Profile menu". */
export const hoverRule: StepRule = {
  name: 'hover',
  description: 'Hovers over an element: "hover over <name>", "hover on <name>"',
  apply(step) {
    const match = /^hover\s+(?:over|on)?\s*(.+)$/i.exec(step.trim())
    if (!match) return null

    return {
      lines: [`await ${targetLocator(match[1])}.hover()`],
      strategies: ['text'],
      assumptions: ['Resolved the hover target via role/text; adjust if ambiguous.'],
      confidence: 0.62,
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

// A trailing role noun, tolerant of an optional qualifier ("nav link", "menu
// item", "primary button") so mid-prose role words still resolve.
const ROLE_SUFFIXES: Array<[RegExp, string]> = [
  [/\s+(?:nav(?:igation)?\s+|primary\s+|secondary\s+|submit\s+)?button$/i, 'button'],
  [/\s+(?:nav(?:igation)?\s+|menu\s+)?link$/i, 'link'],
  [/\s+tab$/i, 'tab'],
  [/\s+checkbox$/i, 'checkbox'],
  [/\s+radio(?:\s+button)?$/i, 'radio'],
  [/\s+(?:menu\s?item|menuitem|submenu(?:\s+item)?)$/i, 'menuitem'],
  [/\s+(?:column\s+header|column\s+heading)$/i, 'columnheader'],
  [/\s+option$/i, 'option'],
]

/**
 * Resolve a target phrase into a role + clean name:
 *  1. peel a trailing role suffix ("... button") to learn the role;
 *  2. if the remainder quotes the target, that quoted span IS the name;
 *  3. otherwise strip surrounding filler/preamble/article.
 * Shared by clickRule and targetLocator so every click path cleans identically.
 */
const roleAndName = (raw: string): { role: string | null; name: string; quoted: boolean } => {
  let s = raw.trim()
  let role: string | null = null
  for (const [suffix, r] of ROLE_SUFFIXES) {
    if (suffix.test(s)) {
      s = s.replace(suffix, '').trim()
      role = r
      break
    }
  }
  const q = extractQuoted(s)
  let name = q != null ? q : stripFiller(unquote(s))
  name = name.replace(/^(?:the|a|an)\s+/i, '').trim()
  return { role, name, quoted: q != null }
}

/**
 * Generic click — the fallback action rule. Infers an ARIA role from a
 * trailing noun ("Save button", "Docs link") and defaults to 'button'.
 */
export const clickRule: StepRule = {
  name: 'click',
  description: 'Clicks an element: "click <name>", "tap <name>", "click the <name> link/tab"',
  apply(step) {
    const match = /^(?:click|tap|hit|press)\s+(?:on\s+)?(.+?)\s*$/i.exec(step.trim())
    if (!match) return null

    // Icon-only affordance ("the gear icon", "☰") -> a likely accessible-name regex.
    const icon = iconAffordance(match[1])
    if (icon) {
      return {
        lines: [`await page.getByRole('button', { name: /${icon}/i }).click()`],
        strategies: ['role'],
        assumptions: [
          `Mapped an icon affordance to likely accessible name(s) /${icon}/i; verify against the app.`,
        ],
        confidence: 0.55,
      }
    }

    const { role: detected, name } = roleAndName(match[1])
    const role = detected ?? 'button'
    const explicit = detected !== null

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
  const { role, name, quoted } = roleAndName(raw)
  if (role) return `page.getByRole('${role}', { name: ${lit(name)} })`
  // Bare role noun ("row", "tab", "items") → role-only locator (used with .nth()).
  if (!quoted) {
    const roleNoun = ROLE_NOUNS[name.toLowerCase()]
    if (roleNoun) return `page.getByRole('${roleNoun}')`
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
    const s = step.trim()
    const tail = '(?:\\s+(?:in|using)\\s+(?:the\\s+)?search\\s+(?:bar|box|field|input))?$'
    // Prefer the text AFTER "for" ("search the catalog for laptops" -> "laptops").
    // Fall back to everything after "search". Only strip a trailing "in the search
    // bar" — never a query that legitimately contains "in" ("food in LA").
    const match =
      new RegExp('^search\\s+.*?\\bfor\\s+(.+?)' + tail, 'i').exec(s) ||
      new RegExp('^search\\s+(.+?)' + tail, 'i').exec(s)
    if (!match) return null
    const query = unquote(match[1].trim())
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
  sixth: 5,
  '6th': 5,
  seventh: 6,
  '7th': 6,
  eighth: 7,
  '8th': 7,
  ninth: 8,
  '9th': 8,
  tenth: 9,
  '10th': 9,
}

/** Click the Nth match: "click the first result", "click the 3rd Add to Cart button". */
export const nthClickRule: StepRule = {
  name: 'click-nth',
  description: 'Clicks the Nth match: "click the first/second/last <target>"',
  apply(step) {
    const match =
      /^click\s+(?:on\s+)?the\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|\d+(?:st|nd|rd|th))\s+(.+)$/i.exec(
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
    return {
      lines: [`await ${targetLocator(match[1])}.dragTo(${targetLocator(match[2])})`],
      strategies: ['text'],
      assumptions: ['Resolved drag source/target via role/text; adjust if ambiguous.'],
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

/**
 * Capture a screenshot:
 *   "take a screenshot"
 *   "take a screenshot named login-page"
 *   "capture a full page screenshot of the cart"
 *   "screenshot the page"
 */
export const screenshotRule: StepRule = {
  name: 'screenshot',
  description: 'Captures a screenshot: "take a screenshot", "take a screenshot named <name>"',
  apply(step) {
    const s = step.trim()
    const m =
      /^(?:take|capture|grab|save)\s+(?:a\s+|an\s+)?(?:full[\s-]?page\s+)?screenshot(?:\s+(?:of\s+)?(?:the\s+)?(?:page|screen|viewport))?(?:\s+(?:named|called|as|of|for)\s+(.+))?$/i.exec(
        s,
      ) || /^screenshot(?:\s+(?:the\s+)?(?:page|screen))?$/i.exec(s)
    if (!m) return null

    const name = (m[1] || '').trim()
    const file = `screenshots/${name ? slugify(name) : 'screenshot'}.png`
    return {
      lines: [`await page.screenshot({ path: ${lit(file)}, fullPage: true })`],
      strategies: [],
      assumptions: name
        ? []
        : [
            'Unnamed screenshot saved as screenshots/screenshot.png; add "named <label>" to keep multiple screenshots distinct.',
          ],
      confidence: 0.9,
    }
  },
}
