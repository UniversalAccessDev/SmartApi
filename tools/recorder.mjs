/**
 * Smart API interactive Recorder.
 *
 * Opens a real (headed) browser. A QA navigates the app — including logging in —
 * and **Alt+Clicks** any element to teach it to the org's KB. Each capture builds
 * a stable locator (prefers #id, then data-testid, then role+name, then label/
 * placeholder) and POSTs it to /api/v1/kb/:org/learn.
 *
 * This is the "manual exploration" companion to the auto-harvester.
 *
 * Usage:
 *   node tools/recorder.mjs --org atwallabs --key <apiKey> [--url https://...] [--api <base>] [--dry]
 *   node tools/recorder.mjs --smoke            # headless self-test (no browser interaction)
 *
 * Requires Playwright: npm i -D playwright && npx playwright install chromium
 */
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const val = (f, d) => {
  const i = args.indexOf(f)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d
}
const org = val('--org', 'default')
const api = val('--api', 'https://smartapi.atwallabs.com')
const key = val('--key', process.env.SMART_API_KEY)
const startUrl = val('--url', 'https://atwallabs.com/login')
const dry = has('--dry')
const smoke = has('--smoke')

const idCss = (id) => (/^[A-Za-z][\w-]*$/.test(id) ? `#${id}` : `[id="${id}"]`)

/** Map a captured element profile -> a KB teach payload. */
const toPayload = (el, route) => {
  const name = (el.name || '').trim()
  const roleNoun =
    el.role === 'link' ? 'link' : el.role === 'textbox' || el.tag === 'input' || el.tag === 'textarea' || el.tag === 'select' ? 'field' : 'button'
  const base = name || el.placeholder || el.id || el.testid
  if (!base) return null
  const phrases = [...new Set([base, `${base} ${roleNoun}`])]
  let loc
  if (el.id) loc = { css: idCss(el.id) }
  else if (el.testid) loc = { testid: el.testid }
  else if (['button', 'link', 'tab', 'checkbox', 'radio'].includes(el.role) && name) loc = { role: el.role, name }
  else if (name) loc = { label: name }
  else if (el.placeholder) loc = { placeholder: el.placeholder }
  else return null
  return { phrases, ...loc, page: route }
}

let captured = 0
const handleCapture = async (page, el) => {
  const route = (() => {
    try {
      return new URL(page.url()).pathname || '/'
    } catch {
      return '/'
    }
  })()
  const payload = toPayload(el, route)
  if (!payload) {
    console.log('  · skipped (no usable locator)')
    return
  }
  const where = payload.css || payload.testid || (payload.role && `${payload.role}:${payload.name}`) || payload.label || payload.placeholder
  if (dry) {
    console.log(`  · CAPTURED (dry): "${payload.phrases[0]}" -> ${where}`)
    captured++
    return
  }
  try {
    const res = await fetch(`${api}/api/v1/kb/${org}/learn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
      body: JSON.stringify({ elements: [payload] }),
    })
    console.log(`  ✓ taught "${payload.phrases[0]}" -> ${where} [${res.status}]`)
    captured++
  } catch (e) {
    console.log('  ✗ post failed:', String(e).split('\n')[0])
  }
}

// Injected into every page: Alt+Click capture + a small on-screen hint.
const injected = () => {
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
  const roleOf = (el) => {
    if (el.getAttribute('role')) return el.getAttribute('role')
    const t = el.tagName.toLowerCase()
    if (t === 'a' && el.hasAttribute('href')) return 'link'
    if (t === 'button') return 'button'
    if (t === 'select') return 'combobox'
    if (t === 'textarea') return 'textbox'
    if (t === 'input') {
      const ty = (el.getAttribute('type') || 'text').toLowerCase()
      if (ty === 'checkbox') return 'checkbox'
      if (ty === 'radio') return 'radio'
      if (ty === 'submit' || ty === 'button') return 'button'
      return 'textbox'
    }
    return ''
  }
  const profile = (el) => ({
    id: el.id || '',
    testid: el.getAttribute('data-testid') || el.getAttribute('data-test') || '',
    role: roleOf(el),
    name: accName(el),
    placeholder: el.getAttribute('placeholder') || '',
    tag: el.tagName.toLowerCase(),
  })
  document.addEventListener(
    'click',
    (e) => {
      if (!e.altKey) return
      const el = e.target.closest('button,[role=button],a[href],input,select,textarea,[data-testid],[role],label') || e.target
      e.preventDefault()
      e.stopPropagation()
      // eslint-disable-next-line no-undef
      window.__smartCapture(profile(el))
    },
    true,
  )
  const banner = () => {
    if (document.getElementById('__smartRecBanner')) return
    const d = document.createElement('div')
    d.id = '__smartRecBanner'
    d.textContent = 'Smart API Recorder — Alt+Click any element to teach it'
    Object.assign(d.style, {
      position: 'fixed', bottom: '10px', right: '10px', zIndex: 2147483647,
      background: '#294172', color: '#fff', font: '12px system-ui, sans-serif',
      padding: '7px 11px', borderRadius: '6px', opacity: '0.92', pointerEvents: 'none',
    })
    document.body.appendChild(d)
  }
  if (document.body) banner()
  window.addEventListener('DOMContentLoaded', banner)
}

const main = async () => {
  const browser = await chromium.launch({ headless: smoke })
  const context = await browser.newContext()
  await context.exposeBinding('__smartCapture', ({ page }, el) => handleCapture(page, el))
  await context.addInitScript(injected)
  const page = await context.newPage()

  if (smoke) {
    // Real navigation (data: URL) so addInitScript injects the listener.
    const html = '<button id="loginBtn">Sign in</button><input id="email" aria-label="Email address" />'
    await page.goto('data:text/html,' + encodeURIComponent(html))
    await page.click('#loginBtn', { modifiers: ['Alt'] })
    await page.click('#email', { modifiers: ['Alt'] })
    await page.waitForTimeout(300)
    await browser.close()
    const ok = captured === 2
    console.log(`\nSmoke ${ok ? 'OK' : 'FAILED'} — ${captured}/2 captures simulated.`)
    process.exit(ok ? 0 : 1)
  }

  console.log(`Recorder open for org "${org}". Navigate/log in, then Alt+Click elements.`)
  console.log('Close the browser window when done.\n')
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await new Promise((resolve) => browser.on('disconnected', resolve))
  console.log(`\nRecorder closed — ${captured} elements taught to "${org}".`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
