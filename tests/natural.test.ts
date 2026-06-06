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
      "await page.getByRole('button', { name: /place order/i }).click()",
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
    ['wait-seconds', 'Wait 3 seconds', "await page.waitForLoadState('networkidle')"],
    ['switch-toggle', 'Switch on notifications', "await page.getByLabel('notifications').check()"],
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
      "await page.getByLabel(/coupon|promo|discount|voucher/i).fill('SAVE10')",
      "await page.getByRole('button', { name: /apply/i }).click()",
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

describe('corpus coverage guard', () => {
  // A representative slice of real QA phrasings. If a future change drops
  // coverage below this bar, this test fails loudly.
  const corpus = [
    'Go to the settings page',
    'Go to the homepage',
    'Go back to the previous page',
    'Open the user menu',
    'Sign in with Google',
    'Register a new account',
    'Reset my password',
    'Log out of the application',
    'Submit the form',
    'Add the item to the cart',
    'Proceed to checkout',
    'Place the order',
    'Remove the product from the cart',
    'Accept all cookies',
    'Sort by name',
    'Switch on notifications',
    'Choose a file',
    'Select all rows',
    'Delete the last row',
    'Apply the discount code SAVE10',
    'Increase the quantity',
    'Move the slider to 50',
    'Verify I am on the checkout page',
    'Verify the modal is closed',
    'Verify there are no results',
    'Verify the success message',
    'Verify the total is $50',
    'Verify the page title contains Home',
    'The page should load',
    'Wait for the page to load',
    'Wait 3 seconds',
  ]
  it('maps at least 90% of the corpus', () => {
    const mapped = corpus.filter((s) => runRulesEngine([s], CTX).analyzed[0].rule !== null).length
    expect(mapped / corpus.length).toBeGreaterThanOrEqual(0.9)
  })
})
