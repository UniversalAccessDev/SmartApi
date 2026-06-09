import { describe, it, expect } from 'vitest'
import { runRulesEngine } from '../src/engine/rulesEngine'
import { StepContext } from '../src/engine/types'

const CTX: StepContext = { closeOverlaysWithEscape: false }

const run = (step: string) => {
  const r = runRulesEngine([step], CTX)
  return { line: r.bodyLines[0], lines: r.bodyLines, rule: r.analyzed[0].rule }
}

describe('navigation extras', () => {
  it('go back', () => {
    const { line, rule } = run('Go back')
    expect(rule).toBe('go-back')
    expect(line).toBe('await page.goBack()')
  })
  it('click the back button', () => {
    expect(run('Click the back button').rule).toBe('go-back')
  })
  it('go forward', () => {
    expect(run('Go forward').line).toBe('await page.goForward()')
  })
  it('reload / refresh', () => {
    expect(run('Reload the page').line).toBe('await page.reload()')
    expect(run('Refresh').line).toBe('await page.reload()')
  })
})

describe('assertion extras', () => {
  it('hidden / not visible', () => {
    const { line, rule } = run('Verify the error message is not visible')
    expect(rule).toBe('assert-hidden')
    expect(line).toBe("await expect(page.getByText('error message')).toBeHidden()")
  })
  it('disappears', () => {
    expect(run('Verify the spinner disappears').rule).toBe('assert-hidden')
  })
  it('should disappear', () => {
    expect(run('The loading spinner should disappear').line).toBe(
      "await expect(page.getByText('loading spinner')).toBeHidden()",
    )
  })
  it('disabled (button -> role)', () => {
    const { line, rule } = run('Verify the Submit button is disabled')
    expect(rule).toBe('assert-disabled')
    expect(line).toBe("await expect(page.getByRole('button', { name: 'Submit' })).toBeDisabled()")
  })
  it('enabled (field -> label)', () => {
    const { line, rule } = run('Verify the Email field is enabled')
    expect(rule).toBe('assert-enabled')
    expect(line).toBe("await expect(page.getByLabel('Email')).toBeEnabled()")
  })
  it('checked', () => {
    const { line, rule } = run('Verify Remember me is checked')
    expect(rule).toBe('assert-checked')
    expect(line).toBe("await expect(page.getByLabel('Remember me')).toBeChecked()")
  })
  it('unchecked', () => {
    expect(run('Verify Subscribe is unchecked').line).toBe(
      "await expect(page.getByLabel('Subscribe')).not.toBeChecked()",
    )
  })
  it('field value', () => {
    const { line, rule } = run('Verify the Email field has value jane@test.com')
    expect(rule).toBe('assert-value')
    expect(line).toBe("await expect(page.getByLabel('Email')).toHaveValue('jane@test.com')")
  })
})

describe('form extras', () => {
  it('radio button', () => {
    const { line, rule } = run('Select the Male radio button')
    expect(rule).toBe('radio')
    expect(line).toBe("await page.getByLabel('Male').check()")
  })
  it('clear field', () => {
    const { line, rule } = run('Clear the Search field')
    expect(rule).toBe('clear-field')
    expect(line).toBe("await page.getByLabel('Search').clear()")
  })
  it('file upload with field', () => {
    const { line, rule } = run('Upload resume.pdf to Resume')
    expect(rule).toBe('file-upload')
    expect(line).toBe("await page.getByLabel('Resume').setInputFiles('resume.pdf')")
  })
  it('file upload without field', () => {
    expect(run('Upload photo.png').line).toBe(
      "await page.locator('input[type=\"file\"]').setInputFiles('photo.png')",
    )
  })
  it('focus a field', () => {
    expect(run('Focus the Email field').line).toBe("await page.getByLabel('Email').focus()")
  })
})

describe('interaction extras', () => {
  it('double click', () => {
    const { line, rule } = run('Double click the row for Jane')
    expect(rule).toBe('double-click')
    expect(line).toBe("await page.getByText('row for Jane').dblclick()")
  })
  it('double-click a button (role)', () => {
    expect(run('Double-click the Save button').line).toBe(
      "await page.getByRole('button', { name: 'Save' }).dblclick()",
    )
  })
  it('right click', () => {
    const { line, rule } = run('Right click the file')
    expect(rule).toBe('right-click')
    expect(line).toBe("await page.getByText('file').click({ button: 'right' })")
  })
  it('search fills searchbox and presses Enter', () => {
    const { lines, rule } = run('Search for laptops')
    expect(rule).toBe('search')
    expect(lines).toEqual([
      "await page.getByRole('searchbox').fill('laptops')",
      "await page.keyboard.press('Enter')",
    ])
  })
  it('scroll to bottom', () => {
    expect(run('Scroll to bottom').line).toBe('await page.mouse.wheel(0, 10000)')
  })
  it('scroll to element', () => {
    expect(run('Scroll to the Footer').line).toBe(
      "await page.getByText('Footer').scrollIntoViewIfNeeded()",
    )
  })
})

describe('no regressions on existing rules', () => {
  it('plain click still a button', () => {
    expect(run('Click Add Contact').rule).toBe('click')
  })
  it('plain fill still works', () => {
    expect(run('Enter Email as jane@test.com').rule).toBe('fill')
  })
  it('positive visibility still works', () => {
    const { line, rule } = run('Verify Jane Doe appears')
    expect(rule).toBe('assert-visible')
    expect(line).toBe("await expect(page.getByText('Jane Doe')).toBeVisible()")
  })
  it('select from dropdown still works', () => {
    expect(run('Select Large from Size').rule).toBe('select-option')
  })
  it('press Enter still a key press', () => {
    expect(run('Press Enter').rule).toBe('press-key')
  })
})
