import { describe, it, expect } from 'vitest'
import { runRulesEngine } from '../src/engine/rulesEngine'
import { StepContext } from '../src/engine/types'

const DEFAULT_CTX: StepContext = { closeOverlaysWithEscape: false }

/** Run a single step and return its first emitted line + matched rule name. */
const run = (step: string, ctx: StepContext = DEFAULT_CTX) => {
  const result = runRulesEngine([step], ctx)
  return {
    line: result.bodyLines[0],
    rule: result.analyzed[0].rule,
    strategies: result.strategies,
    assumptions: result.assumptions,
    confidence: result.analyzed[0].confidence,
  }
}

describe('navigation rule', () => {
  it('navigates to an absolute URL', () => {
    const { line, rule } = run('Go to https://example.com/login')
    expect(rule).toBe('navigate')
    expect(line).toBe("await page.goto('https://example.com/login')")
  })

  it('navigates to a path', () => {
    expect(run('Navigate to /settings').line).toBe("await page.goto('/settings')")
  })

  it('does NOT treat a non-URL "open" as navigation (falls through to click)', () => {
    const { rule } = run('Open the dashboard')
    expect(rule).not.toBe('navigate')
  })
})

describe('click rule', () => {
  it('defaults to a button role', () => {
    const { line, rule, confidence } = run('Click Add Contact')
    expect(rule).toBe('click')
    expect(line).toBe("await page.getByRole('button', { name: 'Add Contact' }).click()")
    expect(confidence).toBe(0.7)
  })

  it('infers a link role from a trailing noun and is more confident', () => {
    const { line, confidence } = run('Click the Docs link')
    expect(line).toBe("await page.getByRole('link', { name: 'Docs' }).click()")
    expect(confidence).toBe(0.85)
  })

  it('infers a tab role', () => {
    expect(run('Click Settings tab').line).toBe(
      "await page.getByRole('tab', { name: 'Settings' }).click()",
    )
  })

  it('strips surrounding quotes from the name', () => {
    expect(run('Click "Save"').line).toBe(
      "await page.getByRole('button', { name: 'Save' }).click()",
    )
  })
})

describe('press-key rule', () => {
  it('presses Enter', () => {
    const { line, rule } = run('Press Enter')
    expect(rule).toBe('press-key')
    expect(line).toBe("await page.keyboard.press('Enter')")
  })

  it('maps esc -> Escape', () => {
    expect(run('Press Esc').line).toBe("await page.keyboard.press('Escape')")
  })

  it('uppercases a single-letter key', () => {
    expect(run('Press a').line).toBe("await page.keyboard.press('A')")
  })

  it('does NOT capture a multi-word target as a key (falls to click)', () => {
    const { rule, line } = run('Press Submit')
    expect(rule).toBe('click')
    expect(line).toBe("await page.getByRole('button', { name: 'Submit' }).click()")
  })
})

describe('fill rule', () => {
  it('handles "enter <field> as <value>"', () => {
    const { line, rule } = run('Enter Full Name as Jane Doe')
    expect(rule).toBe('fill')
    expect(line).toBe("await page.getByLabel('Full Name').fill('Jane Doe')")
  })

  it('handles "fill <field> with <value>"', () => {
    expect(run('Fill Email with jane@test.com').line).toBe(
      "await page.getByLabel('Email').fill('jane@test.com')",
    )
  })

  it('handles "set <field> to <value>"', () => {
    expect(run('Set Company to TestCo').line).toBe(
      "await page.getByLabel('Company').fill('TestCo')",
    )
  })

  it('handles value-first "type <value> in the <field> field"', () => {
    expect(run('Type admin@test.com into the Email field').line).toBe(
      "await page.getByLabel('Email').fill('admin@test.com')",
    )
  })
})

describe('form rules: check / uncheck / select', () => {
  it('checks a checkbox', () => {
    const { line, rule } = run('Check the Terms and Conditions checkbox')
    expect(rule).toBe('check')
    expect(line).toBe("await page.getByLabel('Terms and Conditions').check()")
  })

  it('unchecks a checkbox', () => {
    const { line, rule } = run('Uncheck Subscribe to newsletter')
    expect(rule).toBe('uncheck')
    expect(line).toBe("await page.getByLabel('Subscribe to newsletter').uncheck()")
  })

  it('selects a dropdown option', () => {
    const { line, rule } = run('Select Large from Size')
    expect(rule).toBe('select-option')
    expect(line).toBe("await page.getByLabel('Size').selectOption('Large')")
  })
})

describe('assertion rules', () => {
  it('asserts visibility from "verify X appears"', () => {
    const { line, rule } = run('Verify Jane Doe appears in the contacts list')
    expect(rule).toBe('assert-visible')
    expect(line).toBe("await expect(page.getByText('Jane Doe')).toBeVisible()")
  })

  it('asserts visibility from "X should be visible"', () => {
    expect(run('The welcome banner should be visible').line).toBe(
      "await expect(page.getByText('The welcome banner')).toBeVisible()",
    )
  })

  it('asserts the URL', () => {
    const { line, rule } = run('Verify url is https://example.com/dashboard')
    expect(rule).toBe('assert-url')
    expect(line).toBe("await expect(page).toHaveURL('https://example.com/dashboard')")
  })

  it('asserts the title', () => {
    expect(run('Verify title is Dashboard').line).toBe(
      "await expect(page).toHaveTitle('Dashboard')",
    )
  })

  it('translates "wait for X" into an assertion, never a timeout', () => {
    const { line, rule } = run('Wait for Dashboard to appear')
    expect(rule).toBe('wait-for')
    expect(line).toBe("await expect(page.getByText('Dashboard')).toBeVisible()")
    expect(line).not.toContain('waitForTimeout')
  })
})

describe('hover rule', () => {
  it('hovers over an element', () => {
    const { line, rule } = run('Hover over Account menu')
    expect(rule).toBe('hover')
    expect(line).toBe("await page.getByText('Account menu').hover()")
  })
})

describe('close-overlay rule', () => {
  it('uses the Escape key when closeOverlaysWithEscape is true', () => {
    const { line, rule } = run('Close the modal', { closeOverlaysWithEscape: true })
    expect(rule).toBe('close-overlay')
    expect(line).toBe("await page.keyboard.press('Escape')")
  })

  it('clicks a Close button when the flag is false', () => {
    const { line } = run('Dismiss the notification toast', { closeOverlaysWithEscape: false })
    expect(line).toBe("await page.getByRole('button', { name: /close/i }).click()")
  })
})

describe('unmatched steps', () => {
  it('emits a TODO comment and records the step as unmatched', () => {
    const result = runRulesEngine(['Frobnicate the gizmo wildly'], DEFAULT_CTX)
    expect(result.analyzed[0].rule).toBeNull()
    expect(result.bodyLines[0]).toContain('// TODO: Smart API could not map')
    expect(result.unmatchedSteps).toEqual(['Frobnicate the gizmo wildly'])
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})
