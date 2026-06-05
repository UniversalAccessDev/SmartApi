import { describe, it, expect } from 'vitest'
import { runRulesEngine } from '../src/engine/rulesEngine'
import { generate } from '../src/services/generator.service'
import { GenerateInput } from '../src/schemas/generate.schema'
import { StepContext } from '../src/engine/types'

const CTX: StepContext = { closeOverlaysWithEscape: false }

/** Run a single step and return its emitted lines + matched rule name. */
const run = (step: string) => {
  const result = runRulesEngine([step], CTX)
  return { lines: result.bodyLines, rule: result.analyzed[0].rule }
}

describe('auth-login rule', () => {
  it('expands "Login with Email as ... and Password as ..."', () => {
    const { lines, rule } = run('Login with Email as user@test.com and Password as Secret123')
    expect(rule).toBe('auth-login')
    expect(lines).toEqual([
      "await page.getByLabel('Email').fill('user@test.com')",
      "await page.getByLabel('Password', { exact: true }).fill('Secret123')",
      "await page.getByRole('button', { name: 'Login' }).click()",
    ])
  })

  it('uses the Username label when the field is username', () => {
    const { lines, rule } = run('Login with username user@test.com and password Secret123')
    expect(rule).toBe('auth-login')
    expect(lines).toEqual([
      "await page.getByLabel('Username').fill('user@test.com')",
      "await page.getByLabel('Password', { exact: true }).fill('Secret123')",
      "await page.getByRole('button', { name: 'Login' }).click()",
    ])
  })

  it('uses "Sign in" as the button for the "Sign in with ..." variation', () => {
    const { lines, rule } = run('Sign in with Email as user@test.com and Password as Secret123')
    expect(rule).toBe('auth-login')
    expect(lines[0]).toBe("await page.getByLabel('Email').fill('user@test.com')")
    expect(lines[2]).toBe("await page.getByRole('button', { name: 'Sign in' }).click()")
  })

  it('supports the "Log in with ..." variation', () => {
    const { rule } = run('Log in with Email as user@test.com and Password as Secret123')
    expect(rule).toBe('auth-login')
  })
})

describe('auth-logout rule', () => {
  it('handles bare "Logout"', () => {
    const { lines, rule } = run('Logout')
    expect(rule).toBe('auth-logout')
    expect(lines).toEqual(["await page.getByRole('button', { name: 'Logout' }).click()"])
  })

  it('handles "Log out" and "Click Logout" as Logout', () => {
    for (const step of ['Log out', 'Click Logout']) {
      const { lines, rule } = run(step)
      expect(rule).toBe('auth-logout')
      expect(lines[0]).toBe("await page.getByRole('button', { name: 'Logout' }).click()")
    }
  })

  it('uses "Sign out" as the button for "Sign out"', () => {
    const { lines, rule } = run('Sign out')
    expect(rule).toBe('auth-logout')
    expect(lines[0]).toBe("await page.getByRole('button', { name: 'Sign out' }).click()")
  })
})

describe('auth-verify-logged-in rule', () => {
  it('asserts the Dashboard is visible for each phrasing', () => {
    for (const step of [
      'Verify user is logged in',
      'Verify dashboard appears after login',
      'Verify login successful',
    ]) {
      const { lines, rule } = run(step)
      expect(rule).toBe('auth-verify-logged-in')
      expect(lines[0]).toBe("await expect(page.getByText('Dashboard')).toBeVisible()")
    }
  })
})

describe('auth-verify-logged-out rule', () => {
  it('asserts the Login button is visible for each phrasing', () => {
    for (const step of [
      'Verify user is logged out',
      'Verify Login button appears',
      'Verify login page appears',
    ]) {
      const { lines, rule } = run(step)
      expect(rule).toBe('auth-verify-logged-out')
      expect(lines[0]).toBe(
        "await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()",
      )
    }
  })
})

describe('authentication does not regress existing behavior', () => {
  it('still handles a plain click', () => {
    expect(run('Click Add Contact').rule).toBe('click')
  })

  it('still handles a plain fill', () => {
    expect(run('Enter Email as jane@test.com').rule).toBe('fill')
  })

  it('leaves unsupported steps unmatched as before', () => {
    const result = runRulesEngine(['Frobnicate the gizmo'], CTX)
    expect(result.analyzed[0].rule).toBeNull()
    expect(result.unmatchedSteps).toEqual(['Frobnicate the gizmo'])
  })
})

describe('authentication through the full pipeline', () => {
  const input = (steps: string[]): GenerateInput => ({
    testName: 'Auth flow',
    url: 'https://example.com/login',
    steps,
    language: 'typescript',
    includeScreenshots: false,
    closeOverlaysWithEscape: false,
  })

  it('produces valid, warning-free code for a full login/logout flow', async () => {
    const result = await generate(
      input([
        'Login with Email as user@test.com and Password as Secret123',
        'Verify user is logged in',
        'Logout',
        'Verify user is logged out',
      ]),
    )
    expect(result.validation.valid).toBe(true)
    expect(result.warnings).toEqual([])
    expect(result.code).toContain("await page.getByLabel('Email').fill('user@test.com')")
    expect(result.code).toContain("await expect(page.getByText('Dashboard')).toBeVisible()")
    expect(result.code).not.toContain('waitForTimeout')
    expect(result.meta.stepsAnalyzed.map((s) => s.rule)).toEqual([
      'auth-login',
      'auth-verify-logged-in',
      'auth-logout',
      'auth-verify-logged-out',
    ])
  })

  it('is deterministic for auth flows', async () => {
    const a = await generate(input(['Login with Email as a@b.com and Password as pw']))
    const b = await generate(input(['Login with Email as a@b.com and Password as pw']))
    expect(a.code).toBe(b.code)
  })
})
