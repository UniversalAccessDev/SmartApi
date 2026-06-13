import { describe, it, expect } from 'vitest'
import { createApiKeyGuard } from '../src/middleware/apiKey'
import { createRateLimiter } from '../src/middleware/rateLimit'
import { detectUnsafeCode } from '../src/services/validator.service'
import { generateSchema } from '../src/schemas/generate.schema'
import { generate } from '../src/services/generator.service'
import { openDb } from '../src/kb/db'
import { teach, getEntries, makeResolver } from '../src/kb/kb.service'

// ── tiny express mocks ────────────────────────────────────────────────────
const mockRes = () => {
  const r: Record<string, unknown> = { statusCode: 200, body: undefined, headers: {} }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: unknown) => ((r.body = b), r)
  r.setHeader = (k: string, v: string) => ((r.headers as Record<string, string>)[k] = v)
  return r as {
    statusCode: number
    body: unknown
    headers: Record<string, string>
    status: (c: number) => unknown
    json: (b: unknown) => unknown
    setHeader: (k: string, v: string) => unknown
  }
}
const mockReq = (headers: Record<string, string> = {}, ip = '1.1.1.1') =>
  ({ header: (h: string) => headers[h.toLowerCase()], ip, socket: { remoteAddress: ip } }) as never

describe('security — API key guard', () => {
  it('open mode (no keys) lets requests through', () => {
    let nexted = false
    createApiKeyGuard([])(mockReq(), mockRes() as never, () => (nexted = true))
    expect(nexted).toBe(true)
  })

  it('rejects a missing or wrong key with 401', () => {
    const guard = createApiKeyGuard(['secret-1', 'secret-2'])
    const noKey = mockRes()
    guard(mockReq(), noKey as never, () => undefined)
    expect(noKey.statusCode).toBe(401)
    expect((noKey.body as { code: string }).code).toBe('UNAUTHORIZED')

    const wrong = mockRes()
    guard(mockReq({ 'x-api-key': 'nope' }), wrong as never, () => undefined)
    expect(wrong.statusCode).toBe(401)
  })

  it('accepts a correct key', () => {
    let nexted = false
    createApiKeyGuard(['secret-1'])(
      mockReq({ 'x-api-key': 'secret-1' }),
      mockRes() as never,
      () => (nexted = true),
    )
    expect(nexted).toBe(true)
  })
})

describe('security — rate limiter', () => {
  it('allows up to max, then 429s, and resets after the window', () => {
    let t = 1000
    const limiter = createRateLimiter({ windowMs: 1000, max: 3, now: () => t })
    const hit = (key = 'k1') => {
      const res = mockRes()
      let nexted = false
      limiter(mockReq({ 'x-api-key': key }), res as never, () => (nexted = true))
      return { res, nexted }
    }
    expect(hit().nexted).toBe(true)
    expect(hit().nexted).toBe(true)
    expect(hit().nexted).toBe(true)
    const fourth = hit()
    expect(fourth.nexted).toBe(false)
    expect(fourth.res.statusCode).toBe(429)
    expect((fourth.res.body as { code: string }).code).toBe('RATE_LIMITED')
    // a different key has its own budget
    expect(hit('k2').nexted).toBe(true)
    // after the window elapses, the original key is allowed again
    t += 1001
    expect(hit().nexted).toBe(true)
  })
})

describe('security — org isolation (KB)', () => {
  it("one org cannot read or resolve another org's taught locators", () => {
    const db = openDb(':memory:')
    teach(db, 'orga', { phrases: ['click the special widget'], text: 'Special Widget' })

    expect(getEntries(db, 'orga')).toHaveLength(1)
    expect(getEntries(db, 'orgb')).toHaveLength(0)

    const resolveB = makeResolver(getEntries(db, 'orgb'))
    expect(resolveB('click the special widget')).toBeNull()

    const resolveA = makeResolver(getEntries(db, 'orga'))
    expect(resolveA('click the special widget')).not.toBeNull()
  })
})

describe('security — malicious input', () => {
  it('rejects steps / names containing control characters', () => {
    const NUL = String.fromCharCode(0)
    const BEL = String.fromCharCode(7)

    const badStep = generateSchema.safeParse({
      testName: 'ok',
      url: 'https://x.com',
      steps: [`click ${NUL} me`],
    })
    expect(badStep.success).toBe(false)

    const badName = generateSchema.safeParse({
      testName: `evil${BEL}name`,
      url: 'https://x.com',
      steps: ['click submit'],
    })
    expect(badName.success).toBe(false)

    const ok = generateSchema.safeParse({
      testName: 'fine',
      url: 'https://x.com',
      steps: ['click submit'],
    })
    expect(ok.success).toBe(true)
  })

  it('detectUnsafeCode flags a real code breakout but not string-literal data', () => {
    expect(detectUnsafeCode("await page.goto('x'); eval('bad')").length).toBeGreaterThan(0)
    expect(detectUnsafeCode("const f = new Function('return 1')").length).toBeGreaterThan(0)
    // a button literally named "Run eval() now" is harmless escaped data
    expect(detectUnsafeCode("await page.getByRole('button', { name: 'Run eval() now' }).click()")).toHaveLength(0)
  })

  it('escapes an injection attempt so it stays inert in generated code', async () => {
    const res = await generate({
      testName: 'inject',
      url: 'https://x.com',
      steps: [`Click the "') ; eval('pwned') ; ('" button`],
      language: 'typescript',
      includeScreenshots: false,
      closeOverlaysWithEscape: false,
      outputFormat: 'playwright',
    })
    // lit() kept the payload inside a string literal — no breakout in the skeleton
    expect(detectUnsafeCode(res.code)).toHaveLength(0)
  })
})
