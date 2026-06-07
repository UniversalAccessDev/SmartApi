/**
 * Smart API KB harvester.
 *
 * Opens a page in a real browser, extracts its interactive elements (buttons,
 * links, inputs, selects, [role], [data-testid]) with their accessible names,
 * derives friendly phrases, and POSTs them to the org's KB via /learn.
 *
 * This is a Phase-2 "auto-learn from a page" tool. (A click-to-tag interactive
 * recorder can post to the same /learn endpoint.)
 *
 * Usage:
 *   node tools/harvest.mjs <url> --org <org> --api <baseUrl> --key <apiKey> [--headed] [--dry]
 *
 * Requires Playwright available on the machine running it:
 *   npm i -D playwright && npx playwright install chromium
 */
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const url = args[0]
const opt = (flag, def) => {
  const i = args.indexOf(flag)
  return i >= 0 ? (args[i + 1]?.startsWith('--') ? true : args[i + 1]) : def
}
const org = opt('--org')
const api = opt('--api', 'https://smartapi.atwallabs.com')
const key = opt('--key', process.env.SMART_API_KEY)
const headed = args.includes('--headed')
const dry = args.includes('--dry')

if (!url || !org) {
  console.error('Usage: node tools/harvest.mjs <url> --org <org> [--api <baseUrl>] [--key <apiKey>] [--headed] [--dry]')
  process.exit(1)
}

const route = (() => {
  try {
    return new URL(url).pathname || '/'
  } catch {
    return '/'
  }
})()

const browser = await chromium.launch({ headless: !headed })
const page = await browser.newPage()
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(2000)

// Extract candidate interactive elements + their accessible name in-page.
const raw = await page.evaluate(() => {
  const accName = (el) =>
    (el.getAttribute('aria-label') ||
      (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText) ||
      el.closest('label')?.innerText ||
      el.innerText ||
      el.value ||
      el.getAttribute('placeholder') ||
      el.getAttribute('title') ||
      '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 80)

  const out = []
  const seen = new Set()
  const push = (e) => {
    const k = JSON.stringify(e)
    // Keep anything we can locate: a name, an id, a placeholder, or a testid.
    if (!seen.has(k) && (e.name || e.id || e.placeholder || e.testid)) {
      seen.add(k)
      out.push(e)
    }
  }
  const tid = (el) => el.getAttribute('data-testid') || el.getAttribute('data-test') || ''

  document.querySelectorAll('button, [role=button], input[type=submit], input[type=button]').forEach((el) =>
    push({ kind: 'button', name: accName(el), testid: tid(el) }),
  )
  document.querySelectorAll('a[href]').forEach((el) => push({ kind: 'link', name: accName(el) }))
  document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select').forEach((el) => {
    const label =
      (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText) || el.closest('label')?.innerText || el.getAttribute('aria-label') || ''
    push({
      kind: 'field',
      name: (label || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      id: el.id || '',
      placeholder: el.getAttribute('placeholder') || '',
      testid: tid(el),
    })
  })
  return out
})

await browser.close()

// Prefer a stable #id selector for fields (avoids label collisions like a
// "Show password" toggle also matching getByLabel('Password')).
const idCss = (id) => (/^[A-Za-z][\w-]*$/.test(id) ? `#${id}` : `[id="${id}"]`)

// Map harvested elements -> KB teach payloads.
const elements = []
for (const e of raw) {
  if (e.kind === 'button' && e.name) {
    elements.push({ phrases: [`${e.name} button`, e.name], role: 'button', name: e.name, page: route })
  } else if (e.kind === 'link' && e.name) {
    elements.push({ phrases: [`${e.name} link`, e.name], role: 'link', name: e.name, page: route })
  } else if (e.kind === 'field') {
    const phraseSrc = e.name || e.placeholder || e.testid || e.id
    if (!phraseSrc) continue
    const phrases = [`${phraseSrc} field`, phraseSrc]
    let loc
    if (e.id) loc = { css: idCss(e.id) }
    else if (e.name) loc = { label: e.name }
    else if (e.placeholder) loc = { placeholder: e.placeholder }
    else loc = { testid: e.testid }
    elements.push({ phrases, ...loc, page: route })
  }
}

console.log(`Harvested ${elements.length} elements from ${url}:`)
for (const el of elements) console.log('  -', el.phrases[0], '->', el.role || el.label || el.placeholder || el.testid)

if (dry) {
  console.log('\n(--dry: not posting)')
  process.exit(0)
}
if (!elements.length) {
  console.log('Nothing to learn.')
  process.exit(0)
}

const res = await fetch(`${api}/api/v1/kb/${org}/learn`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
  body: JSON.stringify({ elements }),
})
console.log(`\nPOST /learn -> ${res.status}`)
console.log(await res.text())
