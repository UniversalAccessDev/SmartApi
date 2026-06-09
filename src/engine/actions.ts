/**
 * Translate the engine's generated Playwright statements into a structured
 * action-JSON format consumed by executors that don't run Playwright directly
 * (e.g. Sachaflow's test runner).
 *
 * The engine emits a small, deterministic vocabulary of statements, so this is a
 * faithful 1:1 mapping. Anything outside that vocabulary degrades to a `note`
 * action — never a wrong action — so the executor always gets honest output.
 */

export type By = 'text' | 'label' | 'css' | 'xpath' | 'id'

export interface Target {
  by: By
  value: string
}

export type Action =
  | { type: 'goto'; url: string }
  | { type: 'fill'; target: Target; value: string }
  | { type: 'click'; target: Target }
  | { type: 'hover'; target: Target }
  | { type: 'wait'; ms: number }
  | { type: 'press'; key: string }
  | { type: 'screenshot'; name?: string }
  | { type: 'assertTitle'; contains: string }
  | { type: 'assertUrl'; contains: string }
  | { type: 'assertVisible'; target: Target }
  | { type: 'conditionalclick'; guard: Target; click: { type: 'click'; target: Target } }
  | { type: 'note'; text: string }

// JS string/regex literal fragments used across the statement patterns.
const QUOTED = `'(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"`
const REGEX = `/(?:[^/\\\\]|\\\\.)+/[a-z]*`
const ARG = `(?:${QUOTED}|${REGEX})`

/** Unescape a JS string literal ('a\'b' -> a'b). */
const fromString = (lit: string): string =>
  lit
    .slice(1, -1)
    .replace(/\\(['"`\\])/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')

/** Inner source of a regex literal (/foo/i -> foo). */
const fromRegex = (lit: string): string => lit.replace(/^\/(.*)\/[a-z]*$/, '$1')

/** Resolve a quoted-or-regex argument to its plain string value. */
const argValue = (raw: string): string => {
  const t = raw.trim()
  if (t.startsWith('/')) return fromRegex(t)
  return fromString(t)
}

/**
 * Resolve the primary element target from a statement, by reading the LAST
 * getBy / locator call in the chain (the innermost element actually acted on,
 * e.g. the button inside a scoped row).
 */
const parseTarget = (stmt: string): Target | null => {
  const getByRe = new RegExp(`getBy(Role|Text|Label|Placeholder|TestId|AltText)\\(([^)]*)\\)`, 'g')
  let last: RegExpExecArray | null = null
  let m: RegExpExecArray | null
  while ((m = getByRe.exec(stmt)) !== null) last = m

  if (last) {
    const kind = last[1]
    const inner = last[2]
    switch (kind) {
      case 'Text':
      case 'AltText':
        return { by: 'text', value: argValue(inner) }
      case 'Label':
      case 'Placeholder':
        return { by: 'label', value: argValue(inner) }
      case 'TestId':
        return { by: 'css', value: `[data-testid="${argValue(inner)}"]` }
      case 'Role': {
        const nameM = new RegExp(`name:\\s*(${ARG})`).exec(inner)
        if (nameM) return { by: 'text', value: argValue(nameM[1]) }
        const roleM = /^\s*('([^']+)'|"([^"]+)")/.exec(inner)
        const role = roleM ? (roleM[2] ?? roleM[3]) : 'generic'
        return { by: 'css', value: `[role="${role}"]` }
      }
    }
  }

  // page.locator('selector') / page.locator('xpath=...') / //...
  const locM = new RegExp(`locator\\((${QUOTED})\\)`).exec(stmt)
  if (locM) {
    const sel = argValue(locM[1])
    if (/^(?:xpath=|\/\/|\.\/\/|\()/.test(sel)) {
      return { by: 'xpath', value: sel.replace(/^xpath=/, '') }
    }
    if (/^#[\w-]+$/.test(sel)) return { by: 'id', value: sel.slice(1) }
    return { by: 'css', value: sel }
  }
  return null
}

const note = (text: string): Action => ({ type: 'note', text })

/**
 * Extract the comparison value from a matcher like toHaveTitle(...) / toHaveURL(...),
 * handling a literal string, a regex literal, or `new RegExp('x', 'i')`. Returns
 * null if the matcher is absent.
 */
const matchMatcherArg = (stmt: string, matcher: string): string | null => {
  const re = new RegExp(`${matcher}\\(\\s*(?:new RegExp\\(\\s*(${QUOTED})|(${ARG}))`)
  const m = re.exec(stmt)
  if (!m) return null
  return argValue(m[1] ?? m[2])
}

/** Map a single Playwright statement to one action. */
const toAction = (raw: string): Action => {
  const s = raw.trim()

  // Comments / unmapped TODOs become notes.
  if (s.startsWith('//')) {
    return note(s.replace(/^\/\/\s?/, ''))
  }

  let m: RegExpExecArray | null

  // Conditional: "if (await <guard>.isVisible()) <action>" — must run before the
  // generic click match (the line contains a .click()). Maps a click body to a
  // conditionalclick; anything else stays a note.
  m = /^if \(await (.+?)\.isVisible\(\)\)\s+(.+)$/.exec(s)
  if (m) {
    const guard = parseTarget(`page.${m[1].replace(/^page\./, '')}`)
    const inner = m[2].trim()
    if (guard && /\.(?:click|dblclick)\(/.test(inner) && !inner.startsWith('{')) {
      const target = parseTarget(inner)
      if (target) return { type: 'conditionalclick', guard, click: { type: 'click', target } }
    }
    return note(`Conditional on ${JSON.stringify(guard)}: ${inner.replace(/^await\s+/, '')}`)
  }

  m = new RegExp(`^await page\\.goto\\((${QUOTED})\\)$`).exec(s)
  if (m) return { type: 'goto', url: argValue(m[1]) }

  m = /^await page\.waitForTimeout\((\d+)\)$/.exec(s)
  if (m) return { type: 'wait', ms: parseInt(m[1], 10) }

  if (/waitForLoadState/.test(s)) {
    return note('Wait for the page to finish loading (network idle)')
  }

  m = new RegExp(`\\.screenshot\\(\\{\\s*path:\\s*(${QUOTED})`).exec(s)
  if (m) {
    const path = argValue(m[1])
    const name = (path.split('/').pop() ?? path).replace(/\.png$/i, '')
    return { type: 'screenshot', name }
  }
  if (/\.screenshot\(/.test(s)) return { type: 'screenshot' }

  m = new RegExp(`^await page\\.keyboard\\.press\\((${QUOTED})\\)$`).exec(s)
  if (m) return { type: 'press', key: argValue(m[1]) }

  // toHaveTitle / toHaveURL accept a literal string/regex OR a new RegExp('x', 'i').
  const titleArg = matchMatcherArg(s, 'toHaveTitle')
  if (titleArg !== null) return { type: 'assertTitle', contains: titleArg }
  const urlArg = matchMatcherArg(s, 'toHaveURL')
  if (urlArg !== null) return { type: 'assertUrl', contains: urlArg }

  if (/\)\)\.toBeVisible\(\)$/.test(s)) {
    const target = parseTarget(s)
    if (target) return { type: 'assertVisible', target }
  }

  if (/\.hover\(\)$/.test(s)) {
    const target = parseTarget(s)
    if (target) return { type: 'hover', target }
  }

  m = new RegExp(`\\.fill\\((${QUOTED})\\)$`).exec(s)
  if (m) {
    const target = parseTarget(s)
    if (target) return { type: 'fill', target, value: argValue(m[1]) }
  }

  // check/uncheck a control is functionally a click for executors without a
  // dedicated check action.
  if (/\.(?:check|uncheck)\(\)$/.test(s)) {
    const target = parseTarget(s)
    if (target) return { type: 'click', target }
  }

  if (/\.(?:click|dblclick)\(/.test(s)) {
    const target = parseTarget(s)
    if (target) return { type: 'click', target }
  }

  // Any other assertion (toContainText/toHaveValue/toBeChecked/toBeDisabled/
  // toHaveCount/toBeHidden/...) has no 1:1 action — keep the intent as a note.
  if (/^await expect\(/.test(s)) {
    return note(s.replace(/^await\s+/, ''))
  }

  // selectOption, dialog handlers, keyboard combos, frameLocator, etc.
  return note(s.replace(/^await\s+/, ''))
}

/** Translate the full ordered statement list into an action-JSON array. */
export const toActions = (statements: string[]): Action[] => statements.map(toAction)
