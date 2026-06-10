'use strict'

const { domResolve } = require('./domResolve')

/**
 * Deterministic, Claude-free element resolution.
 *
 * For a Smart API target ({ by, value, role?, nth?, within? }) build an ORDERED
 * list of candidate locators (best strategy first, then looser fallbacks) and
 * use the first that matches the live DOM. This cascade stands in for Claude
 * vision. When `within` is present we resolve the container first and search the
 * leaf inside it, preserving row/card/menu scoping.
 */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Ordered candidate locators for a target, rooted at `root` (page or Locator). */
function candidates(root, target) {
  if (!target) return []
  const v = target.value
  const out = []
  const push = (how, make) => out.push({ how, make })

  switch (target.by) {
    case 'text':
      // If the engine told us the role, try it first — most precise.
      if (target.role)
        push(`role=${target.role} name`, () => root.getByRole(target.role, { name: v }))
      push('role=button name', () => root.getByRole('button', { name: v }))
      push('role=link name', () => root.getByRole('link', { name: v }))
      push('role=tab name', () => root.getByRole('tab', { name: v }))
      push('role=menuitem name', () => root.getByRole('menuitem', { name: v }))
      push('text exact', () => root.getByText(v, { exact: true }))
      push('label', () => root.getByLabel(v))
      push('text partial', () => root.getByText(v))
      push('placeholder', () => root.getByPlaceholder(v))
      push('title/aria attr', () => root.locator(`[title="${v}"], [aria-label="${v}"]`))
      push('text /i', () => root.getByText(new RegExp(escapeRe(v), 'i')))
      break
    case 'label':
      push('label', () => root.getByLabel(v))
      push('placeholder', () => root.getByPlaceholder(v))
      push('role=textbox name', () => root.getByRole('textbox', { name: v }))
      push('role=combobox name', () => root.getByRole('combobox', { name: v }))
      push('name/aria attr', () => root.locator(`[name="${v}" i], [aria-label="${v}" i]`))
      push('label /i', () => root.getByLabel(new RegExp(escapeRe(v), 'i')))
      break
    case 'css':
      push('css', () => root.locator(v))
      break
    case 'xpath':
      push('xpath', () => root.locator(v.startsWith('xpath=') ? v : `xpath=${v}`))
      break
    case 'id':
      push('#id', () => root.locator(`#${v}`))
      push('testid', () => root.getByTestId(v))
      push('name attr', () => root.locator(`[name="${v}"]`))
      break
    default:
      push('text partial', () => root.getByText(v))
  }
  return out
}

function applyNth(locator, nth) {
  if (nth === undefined || nth === null) return locator
  if (nth === -1) return locator.last()
  return locator.nth(nth)
}

/** Resolve a container scope to a single Locator (or null). */
async function resolveScope(page, within, timeout) {
  let loc
  if (within.role) loc = page.getByRole(within.role, { name: within.value })
  else if (within.by === 'css') {
    loc = within.hasText
      ? page.locator(within.value, { hasText: within.hasText })
      : page.locator(within.value)
  } else loc = page.getByText(within.value)

  loc = applyNth(loc, within.nth)
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    let n = 0
    try {
      n = await loc.count()
    } catch {
      n = 0
    }
    if (n > 0) return within.nth !== undefined ? loc : loc.first()
    await page.waitForTimeout(120)
  }
  return null
}

/**
 * Resolve a target to a live, present locator. Returns { locator, how, healed,
 * scoped } or null. `healed` = a fallback (not the first candidate) won;
 * `scoped` = it was resolved inside a `within` container.
 */
async function resolve(page, target, timeout = 3500, hint) {
  let root = page
  let scoped = false
  if (target.within) {
    const container = await resolveScope(page, target.within, Math.min(timeout, 2500))
    if (container) {
      root = container
      scoped = true
    }
    // If the container is missing, fall back to a page-wide search (best effort).
  }

  let cands = candidates(root, target)
  // Selector-learning: promote the previously-winning strategy to the front.
  if (hint) {
    const i = cands.findIndex((c) => c.how === hint)
    if (i > 0) cands = [cands[i], ...cands.slice(0, i), ...cands.slice(i + 1)]
  }
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (let i = 0; i < cands.length; i++) {
      let count = 0
      try {
        count = await cands[i].make().count()
      } catch {
        count = 0
      }
      if (count > 0) {
        return {
          locator: applyNth(cands[i].make(), target.nth),
          how: cands[i].how,
          healed: i > 0,
          scoped,
        }
      }
    }
    await page.waitForTimeout(150)
  }

  // Deep fallback — deterministic "vision" by DOM scoring (Claude-free).
  // This is the long-tail catch the simple cascade can't reach.
  const scored = await domResolve(page, target, Math.min(timeout, 3000))
  if (scored) return { ...scored, scoped: false }
  return null
}

module.exports = { resolve, resolveScope, candidates, applyNth }
