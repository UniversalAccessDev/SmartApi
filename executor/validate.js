'use strict'

/**
 * Dependency-free action-JSON validation for the Executor.
 *
 * Mirrors src/contracts/actions.ts (the service's Zod schema) but with no Zod
 * dependency, so the Executor stays lightweight. Forgiving in the same way:
 * malformed KNOWN actions are hard errors; UNKNOWN action types are skipped
 * (future-safe) rather than failing the whole batch.
 */

const SCHEMA_VERSION = '1.0'

const BY = ['text', 'label', 'css', 'xpath', 'id']
const KNOWN = [
  'goto', 'fill', 'click', 'hover', 'wait', 'press', 'screenshot',
  'assertTitle', 'assertUrl', 'assertVisible', 'conditionalclick', 'extract', 'note',
]

const isStr = (v) => typeof v === 'string'
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

/** Validate a Target (or Scope, which is a superset). Returns an error string or null. */
function checkTarget(t, label) {
  if (!isObj(t)) return `${label} must be an object`
  if (!BY.includes(t.by)) return `${label}.by must be one of ${BY.join('|')}`
  if (!isStr(t.value)) return `${label}.value must be a string`
  if (t.nth !== undefined && !Number.isInteger(t.nth)) return `${label}.nth must be an integer`
  if (t.within !== undefined) {
    const e = checkTarget(t.within, `${label}.within`)
    if (e) return e
  }
  return null
}

/** Validate one known action. Returns an error string or null. */
function checkAction(a) {
  switch (a.type) {
    case 'goto': return isStr(a.url) ? null : 'goto.url must be a string'
    case 'fill': return checkTarget(a.target, 'target') || (isStr(a.value) ? null : 'fill.value must be a string')
    case 'click': return checkTarget(a.target, 'target')
    case 'hover': return checkTarget(a.target, 'target')
    case 'wait': return Number.isInteger(a.ms) && a.ms >= 0 ? null : 'wait.ms must be a non-negative integer'
    case 'press': return isStr(a.key) ? null : 'press.key must be a string'
    case 'screenshot': return a.name === undefined || isStr(a.name) ? null : 'screenshot.name must be a string'
    case 'assertTitle': return isStr(a.contains) ? null : 'assertTitle.contains must be a string'
    case 'assertUrl': return isStr(a.contains) ? null : 'assertUrl.contains must be a string'
    case 'assertVisible': return checkTarget(a.target, 'target')
    case 'conditionalclick': {
      const g = checkTarget(a.guard, 'guard')
      if (g) return g
      if (!isObj(a.click) || a.click.type !== 'click') return 'conditionalclick.click must be a click action'
      return checkTarget(a.click.target, 'click.target')
    }
    case 'extract':
      return checkTarget(a.target, 'target') ||
        (['text', 'value'].includes(a.prop) ? null : "extract.prop must be 'text' or 'value'") ||
        (a.as === undefined || isStr(a.as) ? null : 'extract.as must be a string')
    case 'note': return isStr(a.text) ? null : 'note.text must be a string'
    default: return `unhandled action type "${a.type}"`
  }
}

/**
 * Validate action-JSON. Returns { ok, valid, issues, unknownTypes }.
 * - `valid`: well-formed known actions (safe to run)
 * - `issues`: malformed known actions (hard errors)
 * - `unknownTypes`: skipped unknown action types (not fatal)
 */
function validateActions(input) {
  const issues = []
  const unknownTypes = []
  const valid = []

  if (!Array.isArray(input)) {
    return { ok: false, valid, issues: [{ index: -1, type: '(root)', message: 'actions must be an array' }], unknownTypes }
  }

  input.forEach((raw, index) => {
    const type = isObj(raw) && 'type' in raw ? String(raw.type) : '(missing type)'
    if (!KNOWN.includes(type)) {
      if (!unknownTypes.includes(type)) unknownTypes.push(type)
      return
    }
    const err = checkAction(raw)
    if (err) issues.push({ index, type, message: err })
    else valid.push(raw)
  })

  return { ok: issues.length === 0, valid, issues, unknownTypes }
}

module.exports = { validateActions, SCHEMA_VERSION, KNOWN_ACTION_TYPES: KNOWN }
