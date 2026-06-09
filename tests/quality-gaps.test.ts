import { describe, it, expect } from 'vitest'
import { runRulesEngine } from '../src/engine/rulesEngine'
import { StepContext } from '../src/engine/types'

const ctx: StepContext = {}

/** Run a single step and return its generated line(s) joined. */
const run = (step: string): string => runRulesEngine([step], ctx).bodyLines.join(' | ')

/**
 * Regression suite for the quality/accuracy pass. Each case is a real bug or
 * coverage gap found during the gap audit; the assertion pins the FIXED output
 * so the engine cannot silently regress to the old (wrong) behavior.
 */
describe('quality gaps — accuracy fixes', () => {
  it("strips single quotes from a button name ('Save')", () => {
    expect(run("Click the 'Save' button")).toBe(
      "await page.getByRole('button', { name: 'Save' }).click()",
    )
  })

  it('strips double quotes from a button name ("Add to Cart")', () => {
    expect(run('Click the "Add to Cart" button')).toBe(
      "await page.getByRole('button', { name: 'Add to Cart' }).click()",
    )
  })

  it('strips the article from a filled field ("the Amount")', () => {
    expect(run('Fill the Amount with {{policyValue}}')).toBe(
      "await page.getByLabel('Amount').fill('{{policyValue}}')",
    )
  })

  it('strips the article from an assertion target ("the welcome message")', () => {
    expect(run('Verify the welcome message is displayed')).toBe(
      "await expect(page.getByText('welcome message')).toBeVisible()",
    )
  })

  it('strips quotes from contains-text value ("Invalid")', () => {
    expect(run("Verify error message contains 'Invalid'")).toBe(
      "await expect(page.getByText('error message')).toContainText('Invalid')",
    )
  })

  it('resolves an ordinal role noun to getByRole (second tab)', () => {
    expect(run('Click the second tab')).toBe("await page.getByRole('tab').nth(1).click()")
  })

  it('extracts the query after "for" in a search (catalog for laptops)', () => {
    expect(run('Search the catalog for laptops')).toBe(
      "await page.getByRole('searchbox').fill('laptops') | await page.keyboard.press('Enter')",
    )
  })
})

describe('quality gaps — multi-action splitting', () => {
  it('splits "Enter X as Y and click Z" into two actions', () => {
    expect(run('Enter Name as Jane and click Submit')).toBe(
      "await page.getByLabel('Name').fill('Jane') | await page.getByRole('button', { name: 'Submit' }).click()",
    )
  })

  it('splits "Hover over X and click Y"', () => {
    expect(run('Hover over Account and click Settings')).toBe(
      "await page.getByText('Account').hover() | await page.getByRole('button', { name: 'Settings' }).click()",
    )
  })

  it('does NOT split a button literally named "Save and Continue"', () => {
    // Neither half maps to an action on its own, so the connector must be kept.
    expect(run("Click the 'Save and Continue' button")).toBe(
      "await page.getByRole('button', { name: 'Save and Continue' }).click()",
    )
  })
})

describe('quality gaps — new coverage', () => {
  it('maps a bare "Choose <option>"', () => {
    expect(run('Choose Male')).toBe("await page.getByText('Male').click()")
  })

  it('maps "Verify I see <X>"', () => {
    expect(run('Verify I see the dashboard')).toBe(
      "await expect(page.getByText('dashboard')).toBeVisible()",
    )
  })

  it('maps "the page is loaded"', () => {
    expect(run('Verify the page is loaded')).toBe("await page.waitForLoadState('networkidle')")
  })

  it('maps "the list should have N rows" to a count assertion', () => {
    expect(run('The list should have 10 rows')).toBe(
      "await expect(page.getByRole('row')).toHaveCount(10)",
    )
  })
})

describe('quality gaps — honest non-mapping', () => {
  it('does NOT guess at conditional control flow', () => {
    const r = runRulesEngine(['If the popup appears, close it'], ctx)
    expect(r.unmatchedSteps).toContain('If the popup appears, close it')
  })

  it('does NOT guess a value-less "Enter password"', () => {
    const r = runRulesEngine(['Enter password'], ctx)
    expect(r.unmatchedSteps).toContain('Enter password')
  })
})
