import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { MODEL_NAME } from '../src/constants'

const app = createApp()

const validBody = {
  testName: 'Login flow',
  url: 'https://example.com/login',
  steps: [
    'Login with Email as user@test.com and Password as Secret123',
    'Verify user is logged in',
  ],
}

describe('GET /health', () => {
  it('returns 200 and ok status', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.status).toBe('ok')
    expect(res.body.model).toBe(MODEL_NAME)
  })
})

describe('GET / (service descriptor)', () => {
  it('lists the endpoints', async () => {
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.body.model).toBe(MODEL_NAME)
    expect(res.body.endpoints.generate).toContain('/api/v1/playwright/generate')
  })
})

describe('POST /api/v1/playwright/generate', () => {
  it('generates code for a valid request (open mode, no key configured in tests)', async () => {
    const res = await request(app).post('/api/v1/playwright/generate').send(validBody)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.model).toBe(MODEL_NAME)
    expect(res.body.code).toContain("import { test, expect } from '@playwright/test'")
    expect(res.body.validation.valid).toBe(true)
    expect(Array.isArray(res.body.meta.stepsAnalyzed)).toBe(true)
  })

  it('rejects an invalid body with 400 and field issues', async () => {
    const res = await request(app)
      .post('/api/v1/playwright/generate')
      .send({ testName: '', url: 'nope', steps: [] })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBe('ValidationError')
    expect(res.body.issues.length).toBeGreaterThan(0)
  })

  it('rejects too many steps (input cap) with 400', async () => {
    const res = await request(app)
      .post('/api/v1/playwright/generate')
      .send({ ...validBody, steps: Array(201).fill('Click Save') })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('ValidationError')
  })

  it('rejects an over-long step with 400', async () => {
    const res = await request(app)
      .post('/api/v1/playwright/generate')
      .send({ ...validBody, steps: ['x'.repeat(501)] })
    expect(res.status).toBe(400)
  })
})

describe('knowledge base (per-org)', () => {
  it('teaches a phrase and uses it during generation for that org', async () => {
    const org = 'acme'
    const teachRes = await request(app)
      .post(`/api/v1/kb/${org}/teach`)
      .send({ phrases: ['login button'], role: 'button', name: 'Sign In Now' })
    expect(teachRes.status).toBe(200)
    expect(teachRes.body.success).toBe(true)
    expect(teachRes.body.locator).toBe("page.getByRole('button', { name: 'Sign In Now' })")

    // With the org header, the taught locator is used.
    const withOrg = await request(app)
      .post('/api/v1/playwright/generate')
      .set('X-Org-Id', org)
      .send({ testName: 't', url: 'https://acme.test', steps: ['Click the login button'] })
    expect(withOrg.body.code).toContain("getByRole('button', { name: 'Sign In Now' }).click()")
    expect(withOrg.body.meta.stepsAnalyzed[0].rule).toBe('kb')

    // Without the org header, it falls back to the generic rule.
    const noOrg = await request(app)
      .post('/api/v1/playwright/generate')
      .send({ testName: 't', url: 'https://acme.test', steps: ['Click the login button'] })
    expect(noOrg.body.meta.stepsAnalyzed[0].rule).toBe('click')
  })

  it('rejects a teach payload with no locator', async () => {
    const res = await request(app)
      .post('/api/v1/kb/acme/teach')
      .send({ phrases: ['x'] })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('ValidationError')
  })

  it('bulk-learns elements then uses them in generation', async () => {
    const org = 'harvestco'
    const learnRes = await request(app)
      .post(`/api/v1/kb/${org}/learn`)
      .send({
        elements: [
          { phrases: ['username field'], css: '#txtUser' },
          { phrases: ['password field'], css: '#txtPass' },
          { phrases: ['log on button', 'log on'], role: 'button', name: 'LOG ON' },
        ],
      })
    expect(learnRes.status).toBe(200)
    expect(learnRes.body.elements).toBe(3)

    const gen = await request(app)
      .post('/api/v1/playwright/generate')
      .set('X-Org-Id', org)
      .send({
        testName: 'legacy login',
        url: 'https://legacy.test/login',
        steps: ['Enter admin in the username field', 'Click log on'],
      })
    expect(gen.body.code).toContain("await page.locator('#txtUser').fill('admin')")
    expect(gen.body.code).toContain("getByRole('button', { name: 'LOG ON' }).click()")
    expect(gen.body.meta.stepsAnalyzed.every((s) => s.rule === 'kb')).toBe(true)
  })

  it('lists an org KB', async () => {
    await request(app)
      .post('/api/v1/kb/listco/teach')
      .send({ phrases: ['cart'], css: '#cart' })
    const res = await request(app).get('/api/v1/kb/listco')
    expect(res.status).toBe(200)
    expect(res.body.count).toBeGreaterThanOrEqual(1)
  })
})

describe('usage endpoint', () => {
  it('records calls and returns a summary', async () => {
    await request(app)
      .post('/api/v1/playwright/generate')
      .set('X-Org-Id', 'usagetest')
      .send({ testName: 't', url: 'https://e.com', steps: ['Click Save', 'Verify Done appears'] })
    const res = await request(app).get('/api/v1/usage')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.totalCalls).toBeGreaterThan(0)
    expect(res.body.generateCalls).toBeGreaterThan(0)
    expect(Array.isArray(res.body.byEndpoint)).toBe(true)
    expect(Array.isArray(res.body.recent)).toBe(true)
  })
})

describe('unknown routes', () => {
  it('returns a 404 envelope', async () => {
    const res = await request(app).get('/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBe('Not Found')
  })
})
