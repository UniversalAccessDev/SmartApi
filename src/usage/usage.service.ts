import { KbDatabase } from '../kb/db'

export interface UsageEntry {
  ts: string
  method: string
  path: string
  org: string | null
  status: number
  durationMs: number
  steps?: number | null
  confidence?: number | null
}

/** Record one API call. Best-effort — never throws into the request path. */
export const recordUsage = (db: KbDatabase, e: UsageEntry): void => {
  try {
    db.prepare(
      `INSERT INTO usage_log (ts, method, path, org, status, duration_ms, steps, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      e.ts,
      e.method,
      e.path,
      e.org ?? null,
      e.status,
      Math.round(e.durationMs),
      e.steps ?? null,
      e.confidence ?? null,
    )
  } catch {
    /* logging must never break a request */
  }
}

export interface UsageSummary {
  totalCalls: number
  callsLast7d: number
  generateCalls: number
  avgDurationMs: number
  avgSteps: number | null
  /** Avg confidence across generate calls (the real quality signal). */
  avgConfidence: number | null
  /** Non-generate / 404 / scanner traffic (bot noise) — for context. */
  noiseCalls: number
  byEndpoint: Array<{ endpoint: string; calls: number }>
  byOrg: Array<{ org: string; calls: number }>
  byDay: Array<{ day: string; calls: number }>
  /** Generate calls grouped by org — the meaningful per-customer usage. */
  generateByOrg: Array<{ org: string; calls: number; avgConfidence: number | null }>
  /** Generate calls per day (last 14). */
  generateByDay: Array<{ day: string; calls: number }>
  recent: Array<{
    ts: string
    method: string
    path: string
    org: string | null
    status: number
    durationMs: number
  }>
  /** Recent generate calls only (the signal, not the bot noise). */
  recentGenerate: Array<{
    ts: string
    org: string | null
    steps: number | null
    confidence: number | null
    status: number
    durationMs: number
  }>
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)

/** One analyzed step (subset of the engine's AnalyzedStep). */
export interface WeakStep {
  step: string
  rule: string | null
  confidence: number
}

/**
 * Record steps that failed or mapped weakly so we can see WHAT to fix. Logs any
 * step that is unmapped (rule === null) or below the confidence floor. Best-effort.
 */
export const recordWeakSteps = (
  db: KbDatabase,
  org: string | null,
  analyzed: WeakStep[],
  floor = 0.6,
): void => {
  try {
    const ts = new Date().toISOString()
    const ins = db.prepare(
      `INSERT INTO unmapped_log (ts, org, step, rule, confidence) VALUES (?, ?, ?, ?, ?)`,
    )
    const tx = db.transaction((rows: WeakStep[]) => {
      for (const a of rows) {
        if (a.rule === null || a.confidence < floor) ins.run(ts, org, a.step, a.rule, a.confidence)
      }
    })
    tx(analyzed)
  } catch {
    /* logging must never break a request */
  }
}

/** Most-frequent failing/weak phrasings, optionally scoped to one org. */
export const getUnmapped = (db: KbDatabase, opts: { org?: string; limit?: number } = {}) => {
  const where = opts.org ? `WHERE org = ?` : ''
  const args = opts.org ? [opts.org] : []
  const limit = opts.limit ?? 30
  const g = (sql: string, ...a: unknown[]) => db.prepare(sql).get(...a) as Record<string, unknown>
  const all = (sql: string, ...a: unknown[]) =>
    db.prepare(sql).all(...a) as Record<string, unknown>[]
  return {
    total: num(g(`SELECT COUNT(*) c FROM unmapped_log ${where}`, ...args)?.c),
    unmapped: num(
      g(
        `SELECT COUNT(*) c FROM unmapped_log ${where}${where ? ' AND' : ' WHERE'} rule IS NULL`,
        ...args,
      )?.c,
    ),
    topPhrasings: all(
      `SELECT step, COUNT(*) count, rule, MIN(confidence) confidence FROM unmapped_log ${where} GROUP BY lower(step) ORDER BY count DESC LIMIT ?`,
      ...args,
      limit,
    ),
    recent: all(
      `SELECT ts, org, step, rule, confidence FROM unmapped_log ${where} ORDER BY id DESC LIMIT ?`,
      ...args,
      limit,
    ),
  }
}

/** Aggregate usage for the dashboard/summary endpoint. */
export const getUsageSummary = (db: KbDatabase, limit = 25): UsageSummary => {
  const one = (sql: string, ...args: unknown[]) =>
    db.prepare(sql).get(...args) as Record<string, unknown>
  const all = (sql: string, ...args: unknown[]) =>
    db.prepare(sql).all(...args) as Record<string, unknown>[]

  const total = num(one(`SELECT COUNT(*) c FROM usage_log`)?.c)
  const last7 = num(
    one(`SELECT COUNT(*) c FROM usage_log WHERE ts >= datetime('now','-7 days')`)?.c,
  )
  const gen = num(
    one(`SELECT COUNT(*) c FROM usage_log WHERE path = '/api/v1/playwright/generate'`)?.c,
  )
  const GEN = `path = '/api/v1/playwright/generate'`
  const avgDur = Math.round(num(one(`SELECT AVG(duration_ms) a FROM usage_log WHERE ${GEN}`)?.a))
  const avgStepsRow = one(`SELECT AVG(steps) a FROM usage_log WHERE steps IS NOT NULL`)
  const avgSteps = avgStepsRow?.a == null ? null : Math.round(num(avgStepsRow.a) * 10) / 10
  const avgConfRow = one(`SELECT AVG(confidence) a FROM usage_log WHERE confidence IS NOT NULL`)
  const avgConfidence = avgConfRow?.a == null ? null : Math.round(num(avgConfRow.a) * 100) / 100
  const noise = num(
    one(
      `SELECT COUNT(*) c FROM usage_log WHERE status = 404 OR path = '/' OR path LIKE '%.env%' OR path LIKE '%.git%' OR path LIKE '%favicon%' OR path LIKE '%robots%' OR path LIKE '%/owa%' OR path LIKE '%.php'`,
    )?.c,
  )

  return {
    totalCalls: total,
    callsLast7d: last7,
    generateCalls: gen,
    avgDurationMs: avgDur,
    avgSteps,
    avgConfidence,
    noiseCalls: noise,
    generateByOrg: all(
      `SELECT COALESCE(org,'(direct/test)') org, COUNT(*) calls, AVG(confidence) conf FROM usage_log WHERE ${GEN} GROUP BY org ORDER BY calls DESC`,
    ).map((r) => ({
      org: String(r.org),
      calls: num(r.calls),
      avgConfidence: r.conf == null ? null : Math.round(num(r.conf) * 100) / 100,
    })),
    generateByDay: all(
      `SELECT substr(ts,1,10) day, COUNT(*) calls FROM usage_log WHERE ${GEN} GROUP BY day ORDER BY day DESC LIMIT 14`,
    ).map((r) => ({ day: String(r.day), calls: num(r.calls) })),
    recentGenerate: all(
      `SELECT ts, org, steps, confidence, status, duration_ms FROM usage_log WHERE ${GEN} ORDER BY id DESC LIMIT ?`,
      limit,
    ).map((r) => ({
      ts: String(r.ts),
      org: r.org == null ? null : String(r.org),
      steps: r.steps == null ? null : num(r.steps),
      confidence: r.confidence == null ? null : num(r.confidence),
      status: num(r.status),
      durationMs: num(r.duration_ms),
    })),
    byEndpoint: all(
      `SELECT method || ' ' || path AS endpoint, COUNT(*) calls FROM usage_log GROUP BY endpoint ORDER BY calls DESC`,
    ).map((r) => ({ endpoint: String(r.endpoint), calls: num(r.calls) })),
    byOrg: all(
      `SELECT COALESCE(org,'(none)') org, COUNT(*) calls FROM usage_log GROUP BY org ORDER BY calls DESC`,
    ).map((r) => ({ org: String(r.org), calls: num(r.calls) })),
    byDay: all(
      `SELECT substr(ts,1,10) day, COUNT(*) calls FROM usage_log GROUP BY day ORDER BY day DESC LIMIT 14`,
    ).map((r) => ({ day: String(r.day), calls: num(r.calls) })),
    recent: all(
      `SELECT ts, method, path, org, status, duration_ms FROM usage_log ORDER BY id DESC LIMIT ?`,
      limit,
    ).map((r) => ({
      ts: String(r.ts),
      method: String(r.method),
      path: String(r.path),
      org: r.org == null ? null : String(r.org),
      status: num(r.status),
      durationMs: num(r.duration_ms),
    })),
  }
}
