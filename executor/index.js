'use strict'

const path = require('path')
const { chromium } = require('playwright')
const { resolve } = require('./resolve')
const { load: loadCache } = require('./cache')

// Smart API translation engine (built output). The executor consumes its
// action-JSON + per-step alternatives — no Claude anywhere in this pipeline.
const { runRulesEngine } = require(path.join(__dirname, '..', 'dist', 'engine', 'rulesEngine'))
const { toActions } = require(path.join(__dirname, '..', 'dist', 'engine', 'actions'))

const ACTION_TIMEOUT = 4000

/** Translate one English step into action objects (+ the step's alternatives). */
function translate(step) {
  const r = runRulesEngine([step], { closeOverlaysWithEscape: false })
  return { actions: toActions(r.bodyLines), rule: r.analyzed[0] && r.analyzed[0].rule }
}

/** Resolve a target with selector-learning: try the cached strategy first. */
async function resolveLearned(page, target, cache, timeout) {
  const key = cache && cache.keyOf(cache.hostOf(page.url()), target)
  const hint = cache && cache.get(key)
  const found = await resolve(page, target, timeout, hint)
  if (found && cache) cache.set(key, found.how)
  return found
}

/** Execute a single action against the live page; returns a result record. */
async function runAction(page, action, rec, cache) {
  const r = { type: action.type, status: 'ok', detail: '' }
  try {
    switch (action.type) {
      case 'goto':
        await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 20000 })
        r.detail = action.url
        break
      case 'wait':
        await page.waitForTimeout(Math.min(action.ms, 10000))
        r.detail = `${action.ms}ms`
        break
      case 'press':
        await page.keyboard.press(action.key)
        r.detail = action.key
        break
      case 'screenshot': {
        const file = `executor-shot-${rec.shotCount++}.png`
        await page.screenshot({ path: file, fullPage: true })
        r.detail = file
        break
      }
      case 'click':
      case 'hover':
      case 'fill': {
        // Resolve + act, with one re-resolve/retry to ride out transient
        // re-renders (Playwright already auto-waits + scrolls into view).
        let found = null
        let lastErr = null
        for (let attempt = 0; attempt < 2; attempt++) {
          found = await resolveLearned(page, action.target, cache, ACTION_TIMEOUT)
          if (!found) {
            lastErr = `element not found: ${action.target.by}="${action.target.value}"`
            await page.waitForTimeout(300)
            continue
          }
          try {
            const el = found.locator.first()
            await el.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {})
            if (action.type === 'click') await el.click({ timeout: ACTION_TIMEOUT })
            else if (action.type === 'hover') await el.hover({ timeout: ACTION_TIMEOUT })
            else await el.fill(action.value, { timeout: ACTION_TIMEOUT })
            lastErr = null
            break
          } catch (e) {
            lastErr = (e && e.message ? e.message : String(e)).split('\n')[0].slice(0, 120)
            await page.waitForTimeout(300)
          }
        }
        if (lastErr) {
          r.status = 'failed'
          r.detail = lastErr
        } else {
          r.status = found.healed ? 'healed' : 'ok'
          r.detail = `${action.target.by}="${action.target.value}" via ${found.how}${found.scoped ? ' (scoped)' : ''}`
        }
        break
      }
      case 'assertVisible': {
        const found = await resolveLearned(page, action.target, cache, ACTION_TIMEOUT)
        const visible = found ? await found.locator.first().isVisible() : false
        r.status = visible ? 'ok' : 'failed'
        r.detail = `visible=${visible} (${action.target.value})`
        break
      }
      case 'assertTitle': {
        const title = await page.title()
        const ok = title.toLowerCase().includes(String(action.contains).toLowerCase())
        r.status = ok ? 'ok' : 'failed'
        r.detail = `title="${title}" contains "${action.contains}"=${ok}`
        break
      }
      case 'assertUrl': {
        const ok = page.url().includes(action.contains)
        r.status = ok ? 'ok' : 'failed'
        r.detail = `url contains "${action.contains}"=${ok}`
        break
      }
      case 'conditionalclick': {
        const guard = await resolve(page, action.guard, 1500)
        if (guard && (await guard.locator.first().isVisible())) {
          const t = await resolveLearned(page, action.click.target, cache, ACTION_TIMEOUT)
          if (t) await t.locator.first().click({ timeout: ACTION_TIMEOUT })
          r.detail = `guard visible -> clicked ${action.click.target.value}`
        } else {
          r.status = 'skipped'
          r.detail = 'guard not visible'
        }
        break
      }
      case 'extract': {
        // Reading prefers the real text node over a role match (whose
        // textContent can be empty when the accessible name is computed).
        let loc = null
        if (action.target.by === 'text') {
          const exact = page.getByText(action.target.value, { exact: true })
          if (await exact.count()) loc = exact.first()
          else {
            const partial = page.getByText(action.target.value)
            if (await partial.count()) loc = partial.first()
          }
        }
        if (!loc) {
          const found = await resolveLearned(page, action.target, cache, ACTION_TIMEOUT)
          loc = found && found.locator.first()
        }
        if (!loc) {
          r.status = 'failed'
          r.detail = `nothing to read for "${action.target.value}"`
          break
        }
        const value =
          action.prop === 'value'
            ? await loc.inputValue()
            : ((await loc.innerText().catch(() => null)) ?? (await loc.textContent()) ?? '')
        const name = action.as || action.target.value
        rec.extracted[name] = value.trim()
        r.type = 'extract'
        r.detail = `${name} = "${value.trim()}"`
        break
      }
      case 'note':
        r.status = 'skipped'
        r.detail = action.text
        break
      default:
        r.status = 'skipped'
        r.detail = `unsupported: ${action.type}`
    }
  } catch (e) {
    r.status = 'failed'
    r.detail = (e && e.message ? e.message : String(e)).split('\n')[0].slice(0, 160)
  }
  return r
}

/**
 * Read structured data + an inventory of elements off the LIVE page (no Claude).
 * Demonstrates "read data on page" and "read elements on page" natively.
 */
async function readPage(page) {
  return page.evaluate(() => {
    const txt = (el) => (el && el.textContent ? el.textContent.trim().replace(/\s+/g, ' ') : '')
    const tableToRows = (t) =>
      Array.from(t.querySelectorAll('tr'))
        .slice(0, 5)
        .map((tr) =>
          Array.from(tr.querySelectorAll('th,td'))
            .map((c) => txt(c))
            .filter(Boolean),
        )
        .filter((r) => r.length)
    const firstTable = document.querySelector('table')
    return {
      title: document.title,
      url: location.href,
      headings: Array.from(document.querySelectorAll('h1,h2,h3'))
        .slice(0, 8)
        .map(txt)
        .filter(Boolean),
      counts: {
        buttons: document.querySelectorAll('button,[role=button]').length,
        links: document.querySelectorAll('a[href]').length,
        inputs: document.querySelectorAll('input,textarea,select').length,
        images: document.querySelectorAll('img').length,
        tables: document.querySelectorAll('table').length,
      },
      firstTableRows: firstTable ? tableToRows(firstTable) : [],
    }
  })
}

/**
 * Run a list of plain-English steps end-to-end and return a report.
 * @param {string[]} steps
 * @param {{url?:string, headless?:boolean, screenshot?:boolean}} opts
 */
async function execute(steps, opts = {}) {
  const headless = opts.headless !== false
  const cache = opts.learn === false ? null : loadCache()
  const browser = await chromium.launch({ headless })
  const page = await browser.newPage()
  const rec = { shotCount: 0, extracted: {} }
  const results = []

  try {
    if (opts.url) {
      results.push({
        step: `(goto ${opts.url})`,
        ...(await runAction(page, { type: 'goto', url: opts.url }, rec, cache)),
      })
    }
    for (const step of steps) {
      const { actions } = translate(step)
      if (!actions.length) {
        results.push({ step, type: '-', status: 'unmapped', detail: 'no action produced' })
        continue
      }
      for (const action of actions) {
        results.push({ step, ...(await runAction(page, action, rec, cache)) })
      }
    }
    const data = await readPage(page)
    const finalShot = 'executor-final.png'
    await page.screenshot({ path: finalShot, fullPage: true })
    return {
      results,
      data,
      extracted: rec.extracted,
      finalShot,
      shots: rec.shotCount,
      learned: cache ? cache.size() : 0,
    }
  } finally {
    if (cache) cache.save()
    await browser.close()
  }
}

module.exports = { execute, translate }
