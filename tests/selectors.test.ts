import { describe, it, expect } from 'vitest'
import { runRulesEngine } from '../src/engine/rulesEngine'
import { StepContext } from '../src/engine/types'

const CTX: StepContext = { closeOverlaysWithEscape: false }
const run = (step: string) => {
  const r = runRulesEngine([step], CTX)
  return { line: r.bodyLines[0], lines: r.bodyLines, rule: r.analyzed[0].rule }
}

describe('CSS / XPath / #id escape hatches (legacy support)', () => {
  it('click by #id', () => {
    const { line, rule } = run('Click #submit-btn')
    expect(rule).toBe('click-selector')
    expect(line).toBe("await page.locator('#submit-btn').click()")
  })

  it('click by .class', () => {
    expect(run('Click .btn-primary').line).toBe("await page.locator('.btn-primary').click()")
  })

  it('click by attribute selector', () => {
    expect(run('Click [data-test="save"]').line).toBe(
      'await page.locator(\'[data-test="save"]\').click()',
    )
  })

  it('click by xpath (// shorthand becomes xpath=)', () => {
    expect(run("Click //table//a[text()='Next']").line).toBe(
      "await page.locator('xpath=//table//a[text()=\\'Next\\']').click()",
    )
  })

  it('click the element with css <sel>', () => {
    expect(run('Click the element with css div.legacy > span.link').line).toBe(
      "await page.locator('div.legacy > span.link').click()",
    )
  })

  it('click the element with xpath <sel>', () => {
    expect(run('Click the element with xpath //div[@id="x"]').line).toBe(
      'await page.locator(\'xpath=//div[@id="x"]\').click()',
    )
  })

  it('fill #id with value', () => {
    const { line, rule } = run('Fill #user_email with jane@test.com')
    expect(rule).toBe('fill-selector')
    expect(line).toBe("await page.locator('#user_email').fill('jane@test.com')")
  })

  it('type value into .class', () => {
    expect(run('Type hello into .search-input').line).toBe(
      "await page.locator('.search-input').fill('hello')",
    )
  })

  it('does not hijack normal semantic clicks', () => {
    expect(run('Click Add Contact').rule).toBe('click')
    expect(run('Enter Email as jane@test.com').rule).toBe('fill')
  })
})

describe('iframe support (legacy)', () => {
  it('click inside an iframe (trailing form)', () => {
    const { line, rule } = run('Click Pay in the payment iframe')
    expect(rule).toBe('iframe')
    expect(line).toBe(
      "await page.frameLocator('iframe[name=\"payment\"]').getByRole('button', { name: 'Pay' }).click()",
    )
  })

  it('act inside an iframe (leading form)', () => {
    expect(run('In the #checkout frame, click Submit').line).toBe(
      "await page.frameLocator('#checkout').getByRole('button', { name: 'Submit' }).click()",
    )
  })

  it('fill inside an iframe', () => {
    expect(run('Fill Card Number with 4242 in the payment iframe').line).toBe(
      "await page.frameLocator('iframe[name=\"payment\"]').getByLabel('Card Number').fill('4242')",
    )
  })
})
