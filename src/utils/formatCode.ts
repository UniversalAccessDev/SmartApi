import prettier, { Options } from 'prettier'

const PRETTIER_OPTIONS: Options = {
  parser: 'typescript',
  singleQuote: true,
  semi: false,
  printWidth: 100,
  trailingComma: 'all',
}

/**
 * Format generated code with Prettier. Prettier 3's `format` is async.
 * If formatting fails (e.g. the generated code is somehow invalid) we return
 * the original code unchanged so the request never fails on cosmetics.
 */
export const formatCode = async (code: string): Promise<string> => {
  try {
    return await prettier.format(code, PRETTIER_OPTIONS)
  } catch {
    return code
  }
}
