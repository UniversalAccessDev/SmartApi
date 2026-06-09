import { LocatorStrategy } from './types'

/** Confidence bands. Documented so the score is interpretable, not a mystery number. */
export type ConfidenceLevel = 'high' | 'medium' | 'low'

export const levelFor = (score: number): ConfidenceLevel =>
  score >= 0.8 ? 'high' : score >= 0.6 ? 'medium' : 'low'

const STRATEGY_LABEL: Record<LocatorStrategy, string> = {
  role: 'ARIA role + accessible name (getByRole)',
  label: 'form label (getByLabel)',
  placeholder: 'placeholder text (getByPlaceholder)',
  text: 'visible text (getByText)',
  testid: 'test id (getByTestId)',
  css: 'CSS selector (locator)',
  xpath: 'XPath (locator)',
  frame: 'iframe (frameLocator)',
  keyboard: 'keyboard input',
  url: 'page URL / navigation',
}

/** Pull the first locator's name argument out of a generated line, if any. */
const extractName = (line: string): string | null => {
  // getByRole('button', { name: 'Save' })  /  getByRole('row', { name: /x/i })
  const named = /name:\s*('[^']*'|"[^"]*"|\/[^/]+\/[a-z]*)/.exec(line)
  if (named) return named[1]
  // getByText('Save') / getByLabel('Email') / getByPlaceholder('Search') / getByTestId('x')
  const single = /getBy(?:Text|Label|Placeholder|TestId|AltText)\(\s*('[^']*'|"[^"]*")/.exec(line)
  if (single) return single[1]
  return null
}

/**
 * Produce a one-line rationale and a short list of concrete alternative locators
 * for a translated step, so a reviewer understands *why* this locator was chosen
 * and what to swap to if it does not match the app.
 */
export const explainStep = (
  lines: string[],
  strategies: LocatorStrategy[],
  ruleName: string,
  assumptions: string[],
): { rationale: string; alternatives: string[] } => {
  const primary = strategies[0]
  const first = lines[0] ?? ''
  const name = extractName(first)

  let rationale = primary
    ? `Resolved via ${STRATEGY_LABEL[primary]} (rule: ${ruleName}).`
    : `Mapped by rule "${ruleName}".`
  if (assumptions[0]) rationale += ` ${assumptions[0]}`

  const alternatives: string[] = []
  if (name) {
    switch (primary) {
      case 'role':
        alternatives.push(`page.getByText(${name})`, `page.getByTestId('<your-test-id>')`)
        break
      case 'label':
        alternatives.push(
          `page.getByPlaceholder(${name})`,
          `page.getByRole('textbox', { name: ${name} })`,
        )
        break
      case 'text':
        alternatives.push(
          `page.getByRole('<role>', { name: ${name} })`,
          `page.getByTestId('<your-test-id>')`,
        )
        break
      case 'placeholder':
        alternatives.push(`page.getByLabel(${name})`)
        break
      default:
        break
    }
  }
  return { rationale, alternatives }
}
