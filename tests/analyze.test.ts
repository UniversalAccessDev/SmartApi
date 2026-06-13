import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { analyze } from '../src/services/analyze.service'

const app = createApp()

describe('analyze service — dry analysis', () => {
  it('clean steps: no review required, no teach suggestions, safe-to-generate hint', () => {
    const r = analyze({
      testName: 't',
      steps: ["Fill the Email field with a@b.com", "Click the 'Sign In' button"],
      closeOverlaysWithEscape: false,
    })
    expect(r.stepAnalysis.length).toBeGreaterThan(0)
    expect(r.requiresReview).toBe(false)
    expect(r.suggestedTeachMappings).toHaveLength(0)
    expect(r.recommendedNextActions.join(' ')).toMatch(/safe to generate/i)
  })

  it('unmapped step: review required + teach suggestion + unmatched listed', () => {
    const r = analyze({
      testName: 't',
      steps: ['Reticulate the splines using quantum entanglement'],
      closeOverlaysWithEscape: false,
    })
    expect(r.requiresReview).toBe(true)
    expect(r.unmatchedSteps.length).toBe(1)
    expect(r.reviewReasons.map((x) => x.code)).toContain('unmapped_step')
    expect(r.suggestedTeachMappings).toHaveLength(1)
    expect(r.suggestedTeachMappings[0].reason).toBe('unmapped')
    expect(r.suggestedTeachMappings[0].normalized).toBeTruthy()
    expect(r.recommendedNextActions.join(' ')).toMatch(/teach/i)
  })

  it('does not generate code or actions (dry by contract)', () => {
    const r = analyze({ testName: 't', steps: ['Go to the login page'], closeOverlaysWithEscape: false })
    expect(r).not.toHaveProperty('code')
    expect(r).not.toHaveProperty('actions')
  })
})

describe('POST /api/v1/playwright/analyze', () => {
  it('400 with a structured error envelope on invalid body', async () => {
    const res = await request(app).post('/api/v1/playwright/analyze').send({ steps: [] })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.requestId).toMatch(/^req_/)
    expect(res.body.error.code).toBe('ValidationError')
    expect(Array.isArray(res.body.error.details)).toBe(true)
  })

  it('200 with requestId, orgId, stepAnalysis and recommendations', async () => {
    const res = await request(app)
      .post('/api/v1/playwright/analyze')
      .set('x-org-id', 'acme')
      .send({ testName: 'Checkout', steps: ['Add the item to the cart', 'Proceed to checkout'] })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.requestId).toMatch(/^req_/)
    expect(res.body.orgId).toBe('acme')
    expect(res.body.testName).toBe('Checkout')
    expect(Array.isArray(res.body.stepAnalysis)).toBe(true)
    expect(typeof res.body.requiresReview).toBe('boolean')
    expect(Array.isArray(res.body.recommendedNextActions)).toBe(true)
    // dry: no code / actions in the analyze response
    expect(res.body).not.toHaveProperty('code')
    expect(res.body).not.toHaveProperty('actions')
  })
})
