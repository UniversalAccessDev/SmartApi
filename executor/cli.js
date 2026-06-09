#!/usr/bin/env node
'use strict'

// smartx — run plain-English steps against a real page with Smart API + Playwright.
//   node cli.js --url https://example.com "Click Login" "Type x in the Email field"
//   node cli.js --url <url> --steps steps.json
//   add --headed to watch the browser.

const fs = require('fs')
const { execute } = require('./index')

function parseArgs(argv) {
  const o = { steps: [], headless: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--url') o.url = argv[++i]
    else if (a === '--steps') o.steps.push(...JSON.parse(fs.readFileSync(argv[++i], 'utf8')))
    else if (a === '--headed') o.headless = false
    else o.steps.push(a)
  }
  return o
}

const ICON = { ok: '✓', healed: '~', failed: '✗', skipped: '·', unmapped: '?' }

async function main() {
  const o = parseArgs(process.argv.slice(2))
  if (!o.url) {
    console.error('usage: node cli.js --url <url> "step 1" "step 2" ...  (or --steps file.json)')
    process.exit(1)
  }
  const t0 = Date.now()
  const { results, data, finalShot, shots } = await execute(o.steps, o)

  console.log('\n── Execution ──────────────────────────────────────────────')
  let lastStep = null
  for (const r of results) {
    if (r.step !== lastStep) {
      console.log(`\n• ${r.step}`)
      lastStep = r.step
    }
    console.log(`   ${ICON[r.status] || '?'} ${r.status.padEnd(8)} ${r.type.padEnd(14)} ${r.detail}`)
  }

  const tally = results.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {})
  console.log('\n── Result tally ───────────────────────────────────────────')
  console.log('  ', JSON.stringify(tally))

  console.log('\n── Page data read (no Claude) ─────────────────────────────')
  console.log('   title   :', data.title)
  console.log('   url     :', data.url)
  console.log('   elements:', JSON.stringify(data.counts))
  if (data.headings.length) console.log('   headings:', data.headings.join(' | '))
  if (data.firstTableRows.length) {
    console.log('   table   :')
    for (const row of data.firstTableRows) console.log('     ', row.join('  |  '))
  }

  console.log('\n── Artifacts ──────────────────────────────────────────────')
  console.log('   screenshots:', shots, '+ final:', finalShot)
  console.log(`   (${Math.round((Date.now() - t0) / 100) / 10}s total)\n`)
}

main().catch((e) => {
  console.error('executor error:', e)
  process.exit(1)
})
