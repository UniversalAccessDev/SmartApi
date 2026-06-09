import { describe, it, expect } from 'vitest'
import { runRulesEngine } from '../src/engine/rulesEngine'
import { StepContext } from '../src/engine/types'

const CTX: StepContext = { closeOverlaysWithEscape: false }
const run = (step: string) => {
  const r = runRulesEngine([step], CTX)
  return { line: r.bodyLines[0], lines: r.bodyLines, rule: r.analyzed[0].rule }
}

describe('locator strategies', () => {
  it('placeholder fill (value-first)', () => {
    const { line, rule } = run('Type laptops in the Search placeholder')
    expect(rule).toBe('fill-placeholder')
    expect(line).toBe("await page.getByPlaceholder('Search').fill('laptops')")
  })
  it('placeholder fill (field-first)', () => {
    expect(run('Fill the Email placeholder with jane@test.com').line).toBe(
      "await page.getByPlaceholder('Email').fill('jane@test.com')",
    )
  })
  it('click by test id', () => {
    const { line, rule } = run('Click the element with test id submit-btn')
    expect(rule).toBe('click-testid')
    expect(line).toBe("await page.getByTestId('submit-btn').click()")
  })
  it('click by text', () => {
    const { line, rule } = run('Click on the text Read more')
    expect(rule).toBe('click-text')
    expect(line).toBe("await page.getByText('Read more').click()")
  })
  it('click nth (first)', () => {
    const { line, rule } = run('Click the first result')
    expect(rule).toBe('click-nth')
    expect(line).toBe("await page.getByText('result').first().click()")
  })
  it('click nth (3rd with role)', () => {
    expect(run('Click the 3rd Add to Cart button').line).toBe(
      "await page.getByRole('button', { name: 'Add to Cart' }).nth(2).click()",
    )
  })
  it('click last', () => {
    expect(run('Click the last item').line).toBe("await page.getByRole('listitem').last().click()")
  })
  it('click image', () => {
    const { line, rule } = run('Click the company logo image')
    expect(rule).toBe('click-image')
    expect(line).toBe("await page.getByAltText('company logo').click()")
  })
})

describe('search keeps the full query', () => {
  it('does not drop "in <place>" from the query', () => {
    const { lines, rule } = run('Search for Indian food in Los Angeles')
    expect(rule).toBe('search')
    expect(lines).toEqual([
      "await page.getByRole('searchbox').fill('Indian food in Los Angeles')",
      "await page.keyboard.press('Enter')",
    ])
  })
  it('still strips an explicit "in the search bar"', () => {
    expect(run('Search for laptops in the search bar').lines[0]).toBe(
      "await page.getByRole('searchbox').fill('laptops')",
    )
  })
})

describe('table / row actions', () => {
  it('row action click', () => {
    const { line, rule } = run('Click Edit in the row for Jane Doe')
    expect(rule).toBe('row-action')
    expect(line).toBe(
      "await page.getByRole('row', { name: 'Jane Doe' }).getByRole('button', { name: 'Edit' }).click()",
    )
  })
  it('row action with explicit button + identifier', () => {
    expect(run('Click the Delete button in the row containing alice@test.com').line).toBe(
      "await page.getByRole('row', { name: 'alice@test.com' }).getByRole('button', { name: 'Delete' }).click()",
    )
  })
  it('row contains assertion', () => {
    const { line, rule } = run('Verify the row for Jane Doe contains Active')
    expect(rule).toBe('row-contains')
    expect(line).toBe(
      "await expect(page.getByRole('row', { name: 'Jane Doe' })).toContainText('Active')",
    )
  })
})

describe('advanced interactions', () => {
  it('drag and drop', () => {
    const { line, rule } = run('Drag Card A to Column B')
    expect(rule).toBe('drag')
    expect(line).toBe("await page.getByText('Card A').dragTo(page.getByText('Column B'))")
  })
  it('keyboard combo', () => {
    const { line, rule } = run('Press Ctrl+A')
    expect(rule).toBe('press-key')
    expect(line).toBe("await page.keyboard.press('Control+A')")
  })
  it('keyboard combo with shift', () => {
    expect(run('Press Cmd+Shift+P').line).toBe("await page.keyboard.press('Meta+Shift+P')")
  })
  it('accept dialog', () => {
    const { line, rule } = run('Accept the confirmation dialog')
    expect(rule).toBe('dialog')
    expect(line).toBe("page.once('dialog', (dialog) => dialog.accept())")
  })
  it('dismiss alert', () => {
    expect(run('Dismiss the alert').line).toBe("page.once('dialog', (dialog) => dialog.dismiss())")
  })
  it('expand section', () => {
    const { line, rule } = run('Expand the Advanced section')
    expect(rule).toBe('expand-collapse')
    expect(line).toBe("await page.getByRole('button', { name: 'Advanced' }).click()")
  })
})

describe('screenshot step', () => {
  it('take a screenshot (unnamed)', () => {
    const { line, rule } = run('Take a screenshot')
    expect(rule).toBe('screenshot')
    expect(line).toBe(
      "await page.screenshot({ path: 'screenshots/screenshot.png', fullPage: true })",
    )
  })
  it('take a screenshot named X', () => {
    expect(run('Take a screenshot named Login Page').line).toBe(
      "await page.screenshot({ path: 'screenshots/login-page.png', fullPage: true })",
    )
  })
  it('capture a full page screenshot of the cart', () => {
    expect(run('Capture a full page screenshot of the cart').line).toBe(
      "await page.screenshot({ path: 'screenshots/the-cart.png', fullPage: true })",
    )
  })
  it('screenshot the page', () => {
    expect(run('Screenshot the page').rule).toBe('screenshot')
  })
})

describe('more assertions', () => {
  it('heading visible', () => {
    const { line, rule } = run('Verify the heading Welcome is visible')
    expect(rule).toBe('assert-heading')
    expect(line).toBe("await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible()")
  })
  it('image visible', () => {
    const { line, rule } = run('Verify the company logo image is visible')
    expect(rule).toBe('assert-image')
    expect(line).toBe("await expect(page.getByAltText('company logo')).toBeVisible()")
  })
  it('field focused', () => {
    const { line, rule } = run('Verify the Email field is focused')
    expect(rule).toBe('assert-focused')
    expect(line).toBe("await expect(page.getByLabel('Email')).toBeFocused()")
  })
  it('field empty', () => {
    const { line, rule } = run('Verify the Search field is empty')
    expect(rule).toBe('assert-empty')
    expect(line).toBe("await expect(page.getByLabel('Search')).toHaveValue('')")
  })
  it('link href attribute', () => {
    const { line, rule } = run('Verify the Docs link has href /docs')
    expect(rule).toBe('assert-attribute')
    expect(line).toBe(
      "await expect(page.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs')",
    )
  })
  it('count: table has N rows', () => {
    const { line, rule } = run('Verify the table has 5 rows')
    expect(rule).toBe('assert-count')
    expect(line).toBe("await expect(page.getByRole('row')).toHaveCount(5)")
  })
  it('count: N items are visible', () => {
    expect(run('Verify 3 items are visible').line).toBe(
      "await expect(page.getByRole('listitem')).toHaveCount(3)",
    )
  })
})

describe('no regressions from comprehensive additions', () => {
  it('plain click still a button', () => {
    expect(run('Click Add Contact').rule).toBe('click')
  })
  it('plain fill still works', () => {
    expect(run('Enter Email as jane@test.com').rule).toBe('fill')
  })
  it('press Enter still a single key', () => {
    const { line, rule } = run('Press Enter')
    expect(rule).toBe('press-key')
    expect(line).toBe("await page.keyboard.press('Enter')")
  })
  it('positive visibility still works', () => {
    expect(run('Verify Jane Doe appears').rule).toBe('assert-visible')
  })
  it('select from dropdown still works', () => {
    expect(run('Select Large from Size').rule).toBe('select-option')
  })
  it('check the row count assumption does not swallow plain verify', () => {
    expect(run('Verify Welcome back appears').rule).toBe('assert-visible')
  })
})
