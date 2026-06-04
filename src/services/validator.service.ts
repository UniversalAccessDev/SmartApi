export interface ValidationResult {
  valid: boolean
  warnings: string[]
}

interface ValidationCheck {
  description: string
  test: (code: string) => boolean
  warning: string
}

/**
 * Static quality checks on generated code. Each check returns true when the
 * code is GOOD; a failing check contributes a warning. Add checks here to
 * tighten the quality bar without touching the engine.
 */
const CHECKS: ValidationCheck[] = [
  {
    description: 'imports @playwright/test',
    test: (code) => /from\s+['"]@playwright\/test['"]/.test(code),
    warning: 'Generated code is missing an import from @playwright/test.',
  },
  {
    description: 'declares a test()',
    test: (code) => /\btest\s*\(/.test(code),
    warning: 'Generated code does not include a test() block.',
  },
  {
    description: 'contains an expect() assertion',
    test: (code) => /\bexpect\s*\(/.test(code),
    warning: 'Generated code does not include any expect() assertions.',
  },
  {
    description: 'avoids page.waitForTimeout()',
    test: (code) => !/\.waitForTimeout\s*\(/.test(code),
    warning: 'Generated code uses waitForTimeout(); prefer web-first assertions instead.',
  },
  {
    description: 'avoids XPath selectors',
    // Match real XPath usage only: `xpath=` or a selector string starting with
    // `//` passed to locator()/$()/$$() — never a `//` code comment.
    test: (code) => !/xpath\s*=|\.(?:locator|\$\$?)\(\s*['"`]\s*\/\//i.test(code),
    warning:
      'Generated code appears to use an XPath selector; prefer getByRole/getByLabel/getByText.',
  },
  {
    description: 'has no unmapped TODO steps',
    test: (code) => !/\/\/ TODO: Smart API could not map/.test(code),
    warning: 'One or more steps could not be mapped and were left as TODO comments.',
  },
]

export const validateGeneratedCode = (code: string): ValidationResult => {
  const warnings = CHECKS.filter((check) => !check.test(code)).map((check) => check.warning)
  return {
    valid: warnings.length === 0,
    warnings,
  }
}
