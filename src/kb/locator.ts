import { lit } from '../utils/literal'
import { LocatorStrategy } from '../engine/types'

/**
 * A structured locator spec, taught by an org. Exactly one strategy is used,
 * chosen in priority order. We build the Playwright expression ourselves (never
 * accept a raw locator string) so generated code is always safe.
 */
export interface LocatorSpec {
  role?: string
  name?: string
  label?: string
  placeholder?: string
  text?: string
  testid?: string
  css?: string
}

export interface BuiltLocator {
  expr: string
  strategy: LocatorStrategy
}

export const buildLocator = (s: LocatorSpec): BuiltLocator | null => {
  if (s.css) return { expr: `page.locator(${lit(s.css)})`, strategy: 'css' }
  if (s.testid) return { expr: `page.getByTestId(${lit(s.testid)})`, strategy: 'testid' }
  if (s.role) {
    const name = s.name ? `, { name: ${lit(s.name)} }` : ''
    return { expr: `page.getByRole(${lit(s.role)}${name})`, strategy: 'role' }
  }
  if (s.label) return { expr: `page.getByLabel(${lit(s.label)})`, strategy: 'label' }
  if (s.placeholder)
    return { expr: `page.getByPlaceholder(${lit(s.placeholder)})`, strategy: 'placeholder' }
  if (s.text) return { expr: `page.getByText(${lit(s.text)})`, strategy: 'text' }
  return null
}
