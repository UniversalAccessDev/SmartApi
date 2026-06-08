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
  byEndpoint: Array<{ endpoint: string; calls: number }>
  byOrg: Array<{ org: string; calls: number }>
  byDay: Array<{ day: string; calls: number }>
  recent: Array<{
    ts: string
    method: string
    path: string
    org: string | null
    status: number
    durationMs: number
  }>
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)

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
  const avgDur = Math.round(num(one(`SELECT AVG(duration_ms) a FROM usage_log`)?.a))
  const avgStepsRow = one(`SELECT AVG(steps) a FROM usage_log WHERE steps IS NOT NULL`)
  const avgSteps = avgStepsRow?.a == null ? null : Math.round(num(avgStepsRow.a) * 10) / 10

  return {
    totalCalls: total,
    callsLast7d: last7,
    generateCalls: gen,
    avgDurationMs: avgDur,
    avgSteps,
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
