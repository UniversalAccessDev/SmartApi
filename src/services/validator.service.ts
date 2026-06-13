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
  {
    description: 'has a non-empty test body',
    test: (code) => !/\btest\s*\([^)]*\)\s*,\s*async\s*\(\s*\{[^}]*\}\s*\)\s*=>\s*\{\s*\}\s*\)/.test(code),
    warning: 'Generated test body is empty.',
  },
  {
    description: 'does not navigate to the same URL twice in a row',
    test: (code) => {
      const gotos = [...code.matchAll(/\.goto\(\s*(['"`])([^'"`]+)\1/g)].map((m) => m[2])
      return !gotos.some((u, i) => i > 0 && u === gotos[i - 1])
    },
    warning: 'Generated code navigates to the same URL twice in a row.',
  },
]

export const validateGeneratedCode = (code: string): ValidationResult => {
  const warnings = CHECKS.filter((check) => !check.test(code)).map((check) => check.warning)
  return {
    valid: warnings.length === 0,
    warnings,
  }
}

/**
 * Dangerous patterns that must NEVER appear in generated automation. These are
 * not warnings — they are a hard safety gate: if any match, generation is
 * refused (a crafted step trying to smuggle arbitrary JS into the output).
 *
 * Generated code only ever uses Playwright's web-first API with values escaped
 * through `lit()`, so a legitimate run can never trip these. This is
 * defense-in-depth against a rule that forgets to escape a user value.
 */
const UNSAFE_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'eval()', re: /\beval\s*\(/ },
  { name: 'Function constructor', re: /\bnew\s+Function\s*\(|\bFunction\s*\(\s*['"`]/ },
  { name: 'dynamic import()', re: /\bimport\s*\(/ },
  { name: 'require()', re: /\brequire\s*\(/ },
  { name: 'process access', re: /\bprocess\s*\.|child_process/ },
  { name: 'global escape', re: /\bglobalThis\b|\b__proto__\b|constructor\s*\[\s*['"`]constructor/ },
  { name: 'filesystem/network module', re: /\b(fs|net|http2?|os|vm)\s*\.\s*\w/ },
  { name: 'script/JS-URL injection', re: /<\s*script\b|javascript\s*:/i },
]

/**
 * Remove JS string-literal *contents* so the safety scan only sees real code.
 * A value like a button named "Run eval() now" is harmless data inside a
 * properly-escaped string; only a breakout (`'); eval(`) leaves tokens in the
 * code skeleton. Handles escaped quotes in all three string forms.
 */
const stripStringLiterals = (code: string): string =>
  code.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, "''")

/**
 * Scan generated code for hard-unsafe patterns. Returns the names of any that
 * matched (empty array = safe). Callers should REFUSE to return unsafe code.
 * Scans the literal-stripped skeleton, so dangerous tokens that appear only as
 * escaped string data never trip it — but an actual injection breakout does.
 */
export const detectUnsafeCode = (code: string): string[] => {
  const skeleton = stripStringLiterals(code)
  return UNSAFE_PATTERNS.filter((p) => p.re.test(skeleton)).map((p) => p.name)
}
