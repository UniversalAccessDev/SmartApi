#!/usr/bin/env node
/**
 * Evaluation harness for the rules engine.
 *
 * Reads a JSON array of steps (plain strings) from a file path given as argv[2]
 * (or from stdin if no path), runs each through the REAL engine, and prints a
 * JSON array of { step, mapped, rule, confidence, code, warnings } to stdout.
 *
 * Used by the accuracy audit so subagents evaluate against actual engine output
 * instead of guessing. Requires `npm run build` first (reads from dist/).
 *
 *   node tools/eval.js steps.json    # steps.json = ["Click Login", ...]
 *   echo '["Click Login"]' | node tools/eval.js
 */
const fs = require('fs')
const path = require('path')

const { runRulesEngine } = require(path.join(__dirname, '..', 'dist', 'engine', 'rulesEngine'))

const ctx = { closeOverlaysWithEscape: false }

const readInput = () => {
  const arg = process.argv[2]
  const raw = arg ? fs.readFileSync(arg, 'utf8') : fs.readFileSync(0, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('input must be a JSON array of step strings')
  // Accept either ["step", ...] or [{step: "..."}, ...]
  return parsed.map((x) => (typeof x === 'string' ? x : x.step))
}

const main = () => {
  const steps = readInput()
  const out = steps.map((step) => {
    const r = runRulesEngine([step], ctx)
    const a = r.analyzed[0]
    return {
      step,
      mapped: a.rule !== null,
      rule: a.rule,
      confidence: a.confidence,
      code: r.bodyLines.join('\n'),
      warnings: r.warnings,
    }
  })
  process.stdout.write(JSON.stringify(out, null, 2))
}

main()
