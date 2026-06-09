'use strict'

/**
 * Deterministic, Claude-free element resolution.
 *
 * Given a Smart API action target ({ by, value, nth }), build an ORDERED list of
 * candidate Playwright locators (primary strategy first, then progressively
 * looser fallbacks). The executor tries them in order and uses the first that
 * actually matches an element on the live page. This cascade is what stands in
 * for Claude vision: instead of "look at a screenshot and find it", we try the
 * handful of ways the element is most likely exposed and keep the one that hits.
 */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Build ordered candidate locators for a target. Each entry: { how, make }. */
function candidates(page, target) {
  if (!target) return []
  const v = target.value
  const out = []
  const push = (how, make) => out.push({ how, make })

  switch (target.by) {
    case 'text':
      push("role=button name", () => page.getByRole('button', { name: v }))
      push("role=link name", () => page.getByRole('link', { name: v }))
      push("role=tab name", () => page.getByRole('tab', { name: v }))
      push("role=menuitem name", () => page.getByRole('menuitem', { name: v }))
      push("text exact", () => page.getByText(v, { exact: true }))
      push("label", () => page.getByLabel(v))
      push("text partial", () => page.getByText(v))
      push("placeholder", () => page.getByPlaceholder(v))
      push("title attr", () => page.locator(`[title="${v}"], [aria-label="${v}"]`))
      push("text /i", () => page.getByText(new RegExp(escapeRe(v), 'i')))
      break
    case 'label':
      push("label", () => page.getByLabel(v))
      push("placeholder", () => page.getByPlaceholder(v))
      push("role=textbox name", () => page.getByRole('textbox', { name: v }))
      push("role=combobox name", () => page.getByRole('combobox', { name: v }))
      push("name attr", () => page.locator(`[name="${v}" i], [aria-label="${v}" i]`))
      push("label /i", () => page.getByLabel(new RegExp(escapeRe(v), 'i')))
      break
    case 'css':
      push("css", () => page.locator(v))
      break
    case 'xpath':
      push("xpath", () => page.locator(v.startsWith('xpath=') ? v : `xpath=${v}`))
      break
    case 'id':
      push("#id", () => page.locator(`#${v}`))
      push("testid", () => page.getByTestId(v))
      push("name attr", () => page.locator(`[name="${v}"]`))
      break
    default:
      push("text partial", () => page.getByText(v))
  }
  return out
}

/** Apply a .nth()/.first()/.last() modifier from the target. */
function applyNth(locator, nth) {
  if (nth === undefined || nth === null) return locator
  if (nth === -1) return locator.last()
  return locator.nth(nth)
}

/**
 * Resolve a target to a live, present locator. Returns { locator, how, healed }
 * or null if nothing matched. `healed` is true when a non-primary candidate won
 * (i.e. the first-choice locator missed but a fallback recovered it).
 */
async function resolve(page, target, timeout = 3500) {
  const cands = candidates(page, target)
  const deadline = Date.now() + timeout
  // A couple of passes so dynamically-rendered elements get a chance to appear.
  while (Date.now() < deadline) {
    for (let i = 0; i < cands.length; i++) {
      let count = 0
      try {
        count = await cands[i].make().count()
      } catch {
        count = 0
      }
      if (count > 0) {
        const locator = applyNth(cands[i].make(), target.nth)
        return { locator, how: cands[i].how, healed: i > 0 }
      }
    }
    await page.waitForTimeout(150)
  }
  return null
}

module.exports = { resolve, candidates, applyNth }
