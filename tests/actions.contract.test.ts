import { describe, it, expect } from 'vitest'
import {
  validateActions,
  actionSchema,
  SCHEMA_VERSION,
  KNOWN_ACTION_TYPES,
} from '../src/contracts/actions'
import { runRulesEngine } from '../src/engine/rulesEngine'
import { toActions } from '../src/engine/actions'
import { composeStatements } from '../src/engine/codeBuilder'

describe('action contract — schema version', () => {
  it('exposes a stable schema version', () => {
    expect(SCHEMA_VERSION).toBe('1.0')
  })
})

describe('action contract — validateActions', () => {
  it('accepts a well-formed batch (all known, no issues)', () => {
    const actions = [
      { type: 'goto', url: 'https://example.com' },
      { type: 'fill', target: { by: 'label', value: 'Email' }, value: 'a@b.com' },
      { type: 'click', target: { by: 'text', value: 'Submit', nth: -1 } },
      { type: 'extract', target: { by: 'css', value: '.total' }, prop: 'text', as: 'total' },
      { type: 'conditionalclick', guard: { by: 'text', value: 'Cookie' }, click: { type: 'click', target: { by: 'text', value: 'Accept' } } },
    ]
    const r = validateActions(actions)
    expect(r.ok).toBe(true)
    expect(r.valid).toHaveLength(actions.length)
    expect(r.issues).toHaveLength(0)
    expect(r.unknownTypes).toHaveLength(0)
  })

  it('flags a malformed KNOWN action as a hard issue (fill missing value)', () => {
    const r = validateActions([{ type: 'fill', target: { by: 'label', value: 'Email' } }])
    expect(r.ok).toBe(false)
    expect(r.issues).toHaveLength(1)
    expect(r.issues[0].type).toBe('fill')
    expect(r.issues[0].message).toMatch(/value/)
  })

  it('rejects an unknown `by` and an unknown target shape', () => {
    const r = validateActions([{ type: 'click', target: { by: 'magic', value: 'x' } }])
    expect(r.ok).toBe(false)
    expect(r.issues[0].message).toMatch(/by/)
  })

  it('is future-safe: unknown action types are skipped, not fatal', () => {
    const r = validateActions([
      { type: 'goto', url: 'https://x.com' },
      { type: 'teleport', to: 'mars' }, // a type a future producer might emit
    ])
    expect(r.ok).toBe(true) // unknown types do NOT fail the batch
    expect(r.unknownTypes).toEqual(['teleport'])
    expect(r.valid).toHaveLength(1)
    expect(r.valid[0]).toMatchObject({ type: 'goto' })
  })

  it('rejects a non-array input', () => {
    const r = validateActions({ not: 'an array' } as unknown)
    expect(r.ok).toBe(false)
    expect(r.issues[0].index).toBe(-1)
  })

  it('rejects unknown extra keys (strict)', () => {
    const r = validateActions([{ type: 'note', text: 'hi', danger: 'rm -rf' }])
    expect(r.ok).toBe(false)
    expect(r.issues[0].message).toMatch(/danger|unrecognized/i)
  })

  it('covers every known action type', () => {
    // Guard: the validator's known-list matches the schema's union members.
    const unionTypes = actionSchema.options.map((o) => o.shape.type.value).sort()
    expect([...KNOWN_ACTION_TYPES].sort()).toEqual(unionTypes)
  })
})

describe('action contract — engine output round-trips through the schema', () => {
  it('every action the engine emits for a real test validates', () => {
    const steps = [
      'Go to the login page',
      'Fill the Email field with user@example.com',
      "Click the 'Sign In' button",
      'Verify the dashboard is displayed',
      'In the row for Jane Doe, click Edit',
      'If the cookie banner appears, accept it',
    ]
    const engine = runRulesEngine(steps, { closeOverlaysWithEscape: false })
    const actions = toActions(composeStatements('https://example.com/login', engine.bodyLines))
    const r = validateActions(actions)
    expect(r.issues).toHaveLength(0)
    expect(r.ok).toBe(true)
    expect(r.valid.length).toBe(actions.length)
  })
})
