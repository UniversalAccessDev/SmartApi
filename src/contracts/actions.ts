/**
 * The action-JSON contract — the single source of truth shared by the service
 * (which produces actions) and any runner (which consumes them).
 *
 * Why this file exists: `engine/actions.ts` owns the TypeScript *types* and the
 * code→action mapping. This module adds a runtime **Zod schema** + a forgiving
 * `validateActions()` so we can verify action-JSON at every boundary — before we
 * return it, and before an executor runs it — without trusting the producer.
 *
 * Versioning: `SCHEMA_VERSION` is attached to every `actions` response. Bump the
 * MINOR for backward-compatible additions (a new action type), the MAJOR for a
 * breaking change to an existing action's shape.
 */
import { z } from 'zod'
import type { Action as EngineAction, Target as EngineTarget, Scope as EngineScope } from '../engine/actions'

/** Action-JSON schema version. Returned as `schemaVersion` on actions output. */
export const SCHEMA_VERSION = '1.0'

const bySchema = z.enum(['text', 'label', 'css', 'xpath', 'id'])

export const scopeSchema = z
  .object({
    by: bySchema,
    value: z.string(),
    role: z.string().optional(),
    hasText: z.string().optional(),
    nth: z.number().int().optional(),
  })
  .strict()

export const targetSchema = z
  .object({
    by: bySchema,
    value: z.string(),
    role: z.string().optional(),
    nth: z.number().int().optional(),
    within: scopeSchema.optional(),
  })
  .strict()

const clickSchema = z.object({ type: z.literal('click'), target: targetSchema }).strict()

/** Runtime schema for a single action. Mirrors the `Action` union exactly. */
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('goto'), url: z.string() }).strict(),
  z.object({ type: z.literal('fill'), target: targetSchema, value: z.string() }).strict(),
  clickSchema,
  z.object({ type: z.literal('hover'), target: targetSchema }).strict(),
  z.object({ type: z.literal('wait'), ms: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('press'), key: z.string() }).strict(),
  z.object({ type: z.literal('screenshot'), name: z.string().optional() }).strict(),
  z.object({ type: z.literal('assertTitle'), contains: z.string() }).strict(),
  z.object({ type: z.literal('assertUrl'), contains: z.string() }).strict(),
  z.object({ type: z.literal('assertVisible'), target: targetSchema }).strict(),
  z
    .object({ type: z.literal('conditionalclick'), guard: targetSchema, click: clickSchema })
    .strict(),
  z
    .object({
      type: z.literal('extract'),
      target: targetSchema,
      prop: z.enum(['text', 'value']),
      as: z.string().optional(),
    })
    .strict(),
  z.object({ type: z.literal('note'), text: z.string() }).strict(),
])

/** Reusable contract types (the Zod schema is the source; engine types must match). */
export type Action = z.infer<typeof actionSchema>
export type Target = EngineTarget
export type Scope = EngineScope

/** Every action type this schema version knows how to run. */
export const KNOWN_ACTION_TYPES = [
  'goto', 'fill', 'click', 'hover', 'wait', 'press', 'screenshot',
  'assertTitle', 'assertUrl', 'assertVisible', 'conditionalclick', 'extract', 'note',
] as const

export interface ActionValidationIssue {
  index: number
  type: string
  message: string
}

export interface ActionValidationReport {
  /** True when every KNOWN action is well-formed (unknown types do not fail this). */
  ok: boolean
  /** The well-formed, known actions (safe to run / return). */
  valid: Action[]
  /** Malformed known actions — hard errors a producer must fix. */
  issues: ActionValidationIssue[]
  /** Future-safe: action types this version doesn't recognize. Skipped, not fatal. */
  unknownTypes: string[]
}

/**
 * Validate untrusted action-JSON. Forgiving by design:
 * - a malformed KNOWN action is an `issue` (hard error),
 * - an UNKNOWN action type is collected in `unknownTypes` and skipped, so a newer
 *   producer can add action types without breaking older consumers.
 */
export function validateActions(input: unknown): ActionValidationReport {
  const issues: ActionValidationIssue[] = []
  const unknownTypes: string[] = []
  const valid: Action[] = []

  if (!Array.isArray(input)) {
    return {
      ok: false,
      valid,
      issues: [{ index: -1, type: '(root)', message: 'actions must be an array' }],
      unknownTypes,
    }
  }

  input.forEach((raw, index) => {
    const type =
      raw && typeof raw === 'object' && 'type' in raw
        ? String((raw as { type: unknown }).type)
        : '(missing type)'

    if (!(KNOWN_ACTION_TYPES as readonly string[]).includes(type)) {
      if (!unknownTypes.includes(type)) unknownTypes.push(type)
      return
    }

    const parsed = actionSchema.safeParse(raw)
    if (parsed.success) {
      valid.push(parsed.data)
    } else {
      issues.push({
        index,
        type,
        message: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
      })
    }
  })

  return { ok: issues.length === 0, valid, issues, unknownTypes }
}

/** The shape returned to clients when `outputFormat: "actions"`. */
export interface ActionResponse {
  schemaVersion: string
  actions: Action[]
  /** Present only when the producer emitted action types this version skipped. */
  unknownActionTypes?: string[]
}

// ── Compile-time guard: the Zod-inferred Action and the engine's Action must
//    stay structurally identical. If either drifts, this fails `tsc`.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _actionsInSync: Exact<Action, EngineAction> = true
