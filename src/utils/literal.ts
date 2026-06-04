/**
 * Render a value as a safe single-quoted TypeScript string literal.
 * Escapes backslashes and single quotes so generated code never breaks
 * when a step contains apostrophes or other special characters.
 */
export const lit = (value: string): string =>
  `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
