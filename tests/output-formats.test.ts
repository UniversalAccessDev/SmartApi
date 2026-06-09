import { describe, it, expect } from 'vitest'
import { generate } from '../src/services/generator.service'
import { composeStatements } from '../src/engine/codeBuilder'
import { toActions } from '../src/engine/actions'

const gen = (steps: string[], extra: Record<string, unknown> = {}) =>
  generate({
    testName: 'flow',
    url: 'https://example.com',
    steps,
    language: 'typescript',
    includeScreenshots: false,
    closeOverlaysWithEscape: false,
    outputFormat: 'playwright',
    ...extra,
  } as Parameters<typeof generate>[0])

describe('Issue 1 — no duplicate goto', () => {
  it('collapses a "Go to <url>" step that matches the url parameter', async () => {
    const r = await gen(['Go to https://example.com', 'Click Login'])
    expect((r.code.match(/page\.goto\(/g) ?? []).length).toBe(1)
  })

  it('keeps a goto to a DIFFERENT url (real navigation)', async () => {
    const r = await gen(['Go to https://example.com/next', 'Click Login'])
    expect((r.code.match(/page\.goto\(/g) ?? []).length).toBe(2)
  })

  it('composeStatements dedups an identical goto anywhere in the body', () => {
    const out = composeStatements('https://example.com', [
      "await page.goto('https://example.com')",
      "await page.getByRole('button', { name: 'X' }).click()",
    ])
    expect(out.filter((l) => l.includes('goto')).length).toBe(1)
  })
})

describe('Issue 2 — explicit waits are preserved', () => {
  it('"Wait 2 seconds" -> waitForTimeout(2000)', async () => {
    const r = await gen(['Wait 2 seconds'])
    expect(r.code).toContain('await page.waitForTimeout(2000)')
    expect(r.code).not.toContain('waitForLoadState')
  })

  it('handles ms and minutes', async () => {
    expect((await gen(['Wait 500 ms'])).code).toContain('await page.waitForTimeout(500)')
    expect((await gen(['Wait 1 minute'])).code).toContain('await page.waitForTimeout(60000)')
  })

  it('duration-less "wait for the page to load" still uses waitForLoadState', async () => {
    const r = await gen(['Wait for the page to load'])
    expect(r.code).toContain("await page.waitForLoadState('networkidle')")
  })
})

describe('Issue 3 — action-JSON output format', () => {
  it('returns a faithful action array for outputFormat: "actions"', async () => {
    const r = await gen(
      [
        'Go to https://example.com',
        'Enter john in the Username field',
        'Click Login',
        'Wait 2 seconds',
        'Verify the title contains Dashboard',
      ],
      { outputFormat: 'actions' },
    )
    expect(r.actions[0]).toEqual({ type: 'goto', url: 'https://example.com' })
    expect(r.actions).toContainEqual({
      type: 'fill',
      target: { by: 'label', value: 'Username' },
      value: 'john',
    })
    expect(r.actions).toContainEqual({ type: 'click', target: { by: 'text', value: 'Login' } })
    expect(r.actions).toContainEqual({ type: 'wait', ms: 2000 })
    expect(r.actions).toContainEqual({ type: 'assertTitle', contains: 'Dashboard' })
  })

  it('maps press, hover, assertUrl, assertVisible and screenshot', () => {
    const actions = toActions([
      "await page.goto('https://x.com')",
      "await page.keyboard.press('Enter')",
      "await page.getByText('Menu').hover()",
      "await expect(page).toHaveURL('/dashboard')",
      "await expect(page.getByText('Welcome')).toBeVisible()",
      "await page.screenshot({ path: 'screenshots/home.png', fullPage: true })",
    ])
    expect(actions).toContainEqual({ type: 'press', key: 'Enter' })
    expect(actions).toContainEqual({ type: 'hover', target: { by: 'text', value: 'Menu' } })
    expect(actions).toContainEqual({ type: 'assertUrl', contains: '/dashboard' })
    expect(actions).toContainEqual({
      type: 'assertVisible',
      target: { by: 'text', value: 'Welcome' },
    })
    expect(actions).toContainEqual({ type: 'screenshot', name: 'home' })
  })

  it('degrades unmapped/unsupported statements to honest notes (never wrong actions)', () => {
    const actions = toActions([
      '// TODO: Smart API could not map this step -> "Frobnicate the gizmo"',
      "await expect(page.getByRole('listitem')).toHaveCount(3)",
    ])
    expect(actions[0].type).toBe('note')
    expect(actions[1].type).toBe('note')
  })

  it('scoped row action targets the inner control', () => {
    const actions = toActions([
      "await page.getByRole('row', { name: 'Jane Doe' }).getByRole('button', { name: 'Edit' }).click()",
    ])
    expect(actions[0]).toEqual({ type: 'click', target: { by: 'text', value: 'Edit' } })
  })

  it('test-id and css/xpath locators map to the right "by"', () => {
    const actions = toActions([
      "await page.getByTestId('submit-btn').click()",
      "await page.locator('#email').fill('a@b.com')",
      'await page.locator(\'//div[@id="x"]\').click()',
    ])
    expect(actions[0]).toEqual({
      type: 'click',
      target: { by: 'css', value: '[data-testid="submit-btn"]' },
    })
    expect(actions[1]).toEqual({
      type: 'fill',
      target: { by: 'id', value: 'email' },
      value: 'a@b.com',
    })
    expect(actions[2].type).toBe('click')
    expect((actions[2] as { target: { by: string } }).target.by).toBe('xpath')
  })
})
