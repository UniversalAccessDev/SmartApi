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

describe('unknown routes', () => {
  it('returns a 404 envelope', async () => {
    const res = await request(app).get('/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBe('Not Found')
  })
})
