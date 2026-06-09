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
  /** Index when the locator was scoped with .nth()/.first()/.last() (-1 = last). */
  nth?: number
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
/**
 * Turn a regex source used as an accessible name (e.g. "confirm|yes|ok",
 * "add to (?:cart|basket|bag)", "check ?out") into a usable literal target by
 * taking the first alternative and dropping regex syntax.
 */
const regexNameToLiteral = (src: string): string =>
  src
    .replace(/\(\?:([^)|]*)(?:\|[^)]*)?\)/g, '$1') // (?:a|b) -> a
    .replace(/\\s[*+]?/g, ' ') // \s* -> space
    .replace(/[?*+^$]/g, '') // drop quantifiers/anchors
    .replace(/\\(.)/g, '$1') // unescape
    .split('|')[0] // first top-level alternative
    .replace(/\s+/g, ' ')
    .trim()

/** A single getBy / locator call discovered in a statement. */
interface Call {
  index: number
  kind: string
  role?: string
  name?: string
  arg?: string
}

const parseTarget = (stmt: string): Target | null => {
  const calls: Call[] = []
  let m: RegExpExecArray | null

  // getByRole('role'[, { name: <regex|quoted>[, exact] }]) — regex-literal aware
  // so names containing parens (e.g. /add to (?:cart)/i) are not truncated.
  const roleRe =
    /getByRole\(\s*['"](\w+)['"]\s*(?:,\s*\{\s*name:\s*(\/(?:[^/\\]|\\.)+\/[a-z]*|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*(?:,\s*exact:\s*\w+\s*)?\})?\s*\)/g
  while ((m = roleRe.exec(stmt)) !== null)
    calls.push({ index: m.index, kind: 'Role', role: m[1], name: m[2] })

  const otherRe = new RegExp(`getBy(Text|Label|Placeholder|TestId|AltText)\\((${ARG})\\)`, 'g')
  while ((m = otherRe.exec(stmt)) !== null) calls.push({ index: m.index, kind: m[1], arg: m[2] })

  const locRe = new RegExp(`locator\\((${QUOTED})\\)`, 'g')
  while ((m = locRe.exec(stmt)) !== null) calls.push({ index: m.index, kind: 'Locator', arg: m[1] })

  if (!calls.length) return null
  calls.sort((a, b) => a.index - b.index)
  const last = calls[calls.length - 1]

  // Trailing index modifier on the chain (.nth/.first/.last).
  let nth: number | undefined
  const nthM = /\.nth\((\d+)\)/.exec(stmt)
  if (nthM) nth = parseInt(nthM[1], 10)
  else if (/\.first\(\)/.test(stmt)) nth = 0
  else if (/\.last\(\)/.test(stmt)) nth = -1
  const withNth = (t: Target): Target => (nth !== undefined ? { ...t, nth } : t)

  switch (last.kind) {
    case 'Text':
    case 'AltText':
      return withNth({ by: 'text', value: argValue(last.arg!) })
    case 'Label':
    case 'Placeholder':
      return withNth({ by: 'label', value: argValue(last.arg!) })
    case 'TestId':
      return withNth({ by: 'css', value: `[data-testid="${argValue(last.arg!)}"]` })
    case 'Role': {
      if (last.name) {
        const isRegex = last.name.trim().startsWith('/')
        const value = isRegex ? regexNameToLiteral(fromRegex(last.name)) : argValue(last.name)
        return withNth({ by: 'text', value })
      }
      return withNth({ by: 'css', value: `[role="${last.role}"]` })
    }
    case 'Locator': {
      const sel = argValue(last.arg!)
      if (/^(?:xpath=|\/\/|\.\/\/|\()/.test(sel)) {
        return withNth({ by: 'xpath', value: sel.replace(/^xpath=/, '') })
      }
      if (/^#[\w-]+$/.test(sel)) return withNth({ by: 'id', value: sel.slice(1) })
      return withNth({ by: 'css', value: sel })
    }
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
