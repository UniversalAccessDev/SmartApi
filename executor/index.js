'use strict'

const path = require('path')
const { chromium } = require('playwright')
const { resolve } = require('./resolve')

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

/** Execute a single action against the live page; returns a result record. */
async function runAction(page, action, rec) {
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
        const found = await resolve(page, action.target, ACTION_TIMEOUT)
        if (!found) {
          r.status = 'failed'
          r.detail = `element not found: ${action.target.by}="${action.target.value}"`
          break
        }
        r.detail = `${action.target.by}="${action.target.value}" via ${found.how}`
        r.status = found.healed ? 'healed' : 'ok'
        if (action.type === 'click') await found.locator.first().click({ timeout: ACTION_TIMEOUT })
        else if (action.type === 'hover') await found.locator.first().hover({ timeout: ACTION_TIMEOUT })
        else await found.locator.first().fill(action.value, { timeout: ACTION_TIMEOUT })
        break
      }
      case 'assertVisible': {
        const found = await resolve(page, action.target, ACTION_TIMEOUT)
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
          const t = await resolve(page, action.click.target, ACTION_TIMEOUT)
          if (t) await t.locator.first().click({ timeout: ACTION_TIMEOUT })
          r.detail = `guard visible -> clicked ${action.click.target.value}`
        } else {
          r.status = 'skipped'
          r.detail = 'guard not visible'
        }
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
        .map((tr) => Array.from(tr.querySelectorAll('th,td')).map((c) => txt(c)).filter(Boolean))
        .filter((r) => r.length)
    const firstTable = document.querySelector('table')
    return {
      title: document.title,
      url: location.href,
      headings: Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 8).map(txt).filter(Boolean),
      counts: {
        buttons: document.querySelectorAll("button,[role=button]").length,
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
  const browser = await chromium.launch({ headless })
  const page = await browser.newPage()
  const rec = { shotCount: 0 }
  const results = []

  try {
    if (opts.url) {
      results.push({ step: `(goto ${opts.url})`, ...(await runAction(page, { type: 'goto', url: opts.url }, rec)) })
    }
    for (const step of steps) {
      const { actions } = translate(step)
      if (!actions.length) {
        results.push({ step, type: '-', status: 'unmapped', detail: 'no action produced' })
        continue
      }
      for (const action of actions) {
        results.push({ step, ...(await runAction(page, action, rec)) })
      }
    }
    const data = await readPage(page)
    const finalShot = 'executor-final.png'
    await page.screenshot({ path: finalShot, fullPage: true })
    return { results, data, finalShot, shots: rec.shotCount }
  } finally {
    await browser.close()
  }
}

module.exports = { execute, translate }
