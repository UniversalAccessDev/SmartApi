import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, KbDatabase } from '../src/kb/db'
import { recordUsage, getUsageSummary } from '../src/usage/usage.service'

let db: KbDatabase
beforeEach(() => {
  db = openDb(':memory:')
})

const now = () => new Date().toISOString()

describe('usage logging', () => {
  it('records and summarizes calls', () => {
    recordUsage(db, {
      ts: now(),
      method: 'POST',
      path: '/api/v1/playwright/generate',
      org: 'atwallabs',
      status: 200,
      durationMs: 240,
      steps: 4,
      confidence: 0.8,
    })
    recordUsage(db, {
      ts: now(),
      method: 'POST',
      path: '/api/v1/playwright/generate',
      org: 'sachaflow',
      status: 200,
      durationMs: 260,
      steps: 6,
      confidence: 0.7,
    })
    recordUsage(db, {
      ts: now(),
      method: 'GET',
      path: '/api/v1/kb/atwallabs',
      org: null,
      status: 200,
      durationMs: 12,
    })

    const s = getUsageSummary(db)
    expect(s.totalCalls).toBe(3)
    expect(s.generateCalls).toBe(2)
    expect(s.avgSteps).toBe(5) // (4 + 6) / 2
    expect(s.byEndpoint[0].endpoint).toBe('POST /api/v1/playwright/generate')
    expect(s.byEndpoint[0].calls).toBe(2)
    expect(s.byOrg.map((o) => o.org).sort()).toContain('atwallabs')
    expect(s.recent.length).toBe(3)
    expect(s.recent[0].path).toBe('/api/v1/kb/atwallabs') // most recent first
  })

  it('avgSteps is null when no generate calls have steps', () => {
    recordUsage(db, {
      ts: now(),
      method: 'GET',
      path: '/api/v1/usage',
      org: null,
      status: 200,
      durationMs: 5,
    })
    expect(getUsageSummary(db).avgSteps).toBeNull()
  })
})
