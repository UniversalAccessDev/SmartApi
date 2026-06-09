import { describe, it, expect } from 'vitest'
import { runRulesEngine } from '../src/engine/rulesEngine'
import { StepContext } from '../src/engine/types'

const CTX: StepContext = { closeOverlaysWithEscape: false }
const run = (step: string) => {
  const r = runRulesEngine([step], CTX)
  return { line: r.bodyLines[0], lines: r.bodyLines, rule: r.analyzed[0].rule }
}

describe('natural-language rules', () => {
  const cases: Array<[string, string, string]> = [
    [
      'nav-to-page',
      'Go to the settings page',
      "await page.getByRole('link', { name: 'settings' }).click()",
    ],
    ['go-home', 'Go to the homepage', "await page.goto('/')"],
    [
      'open-element',
      'Open the user menu',
      "await page.getByRole('button', { name: 'user' }).click()",
    ],
    [
      'submit-form',
      'Submit the form',
      'await page.getByRole("button", { name: /submit/i }).click()'.replace(/"/g, "'"),
    ],
    [
      'add-to-cart',
      'Add the item to the cart',
      "await page.getByRole('button', { name: /add to (?:cart|basket|bag)/i }).click()",
    ],
    [
      'place-order',
      'Place the order',
      "await page.getByRole('button', { name: /place order|submit order|complete (?:order|purchase)|buy now/i }).click()",
    ],
    [
      'accept-cookies',
      'Accept all cookies',
      "await page.getByRole('button', { name: /accept/i }).click()",
    ],
    [
      'social-login',
      'Sign in with Google',
      "await page.getByRole('button', { name: new RegExp('Google', 'i') }).click()",
    ],
    [
      'register',
      'Register a new account',
      "await page.getByRole('button', { name: /sign ?up|register|create account/i }).click()",
    ],
    [
      'forgot-password',
      'Reset my password',
      "await page.getByRole('link', { name: /forgot|reset/i }).click()",
    ],
    ['slider', 'Move the slider to 50', "await page.getByRole('slider').fill('50')"],
    [
      'select-all',
      'Select all rows',
      "await page.getByRole('checkbox', { name: /select all/i }).check()",
    ],
    [
      'delete-row',
      'Delete the last row',
      "await page.getByRole('row').last().getByRole('button', { name: /delete|remove/i }).click()",
    ],
    [
      'assert-on-page',
      'Verify I am on the checkout page',
      "await expect(page).toHaveURL(new RegExp('checkout', 'i'))",
    ],
    [
      'assert-modal-closed',
      'Verify the modal is closed',
      "await expect(page.getByRole('dialog')).toBeHidden()",
    ],
    [
      'assert-total',
      'Verify the total is $50',
      "await expect(page.getByText('$50')).toBeVisible()",
    ],
    ['page-should-load', 'The page should load', "await page.waitForLoadState('networkidle')"],
    ['wait-seconds', 'Wait 3 seconds', 'await page.waitForTimeout(3000)'],
    [
      'switch-toggle',
      'Switch on notifications',
      "await page.getByRole('switch', { name: 'notifications' }).check()",
    ],
  ]

  for (const [rule, step, expected] of cases) {
    it(`${rule}: "${step}"`, () => {
      const { line, rule: matched } = run(step)
      expect(matched).toBe(rule)
      expect(line).toBe(expected)
    })
  }

  it('coupon emits fill + apply', () => {
    const { lines, rule } = run('Apply the discount code SAVE10')
    expect(rule).toBe('coupon')
    expect(lines).toEqual([
      "await page.getByLabel(/coupon|promo|discount|voucher|gift\\s*card/i).fill('SAVE10')",
      "await page.getByRole('button', { name: /apply|redeem/i }).click()",
    ])
  })

  it('title contains -> regex toHaveTitle', () => {
    expect(run('Verify the page title contains Dashboard').line).toBe(
      "await expect(page).toHaveTitle(new RegExp('Dashboard', 'i'))",
    )
  })

  it('logout with trailing words still maps', () => {
    expect(run('Log out of the application').rule).toBe('auth-logout')
  })

  it('genuinely out-of-scope steps stay honestly unmapped', () => {
    for (const step of ['Open a new tab', 'Maximize the window', 'Verify an email was sent']) {
      expect(run(step).rule).toBeNull()
    }
  })
})

// Corpus coverage is guarded in tests/corpus.test.ts against tests/fixtures/corpus.ts.
