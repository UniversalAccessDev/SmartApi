import { describe, it, expect } from 'vitest'
import { lit } from '../src/utils/literal'
import { slugify } from '../src/utils/slug'

describe('lit', () => {
  it('wraps a plain string in single quotes', () => {
    expect(lit('Jane Doe')).toBe("'Jane Doe'")
  })

  it('escapes single quotes', () => {
    expect(lit("O'Brien")).toBe("'O\\'Brien'")
  })

  it('escapes backslashes', () => {
    expect(lit('a\\b')).toBe("'a\\\\b'")
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Add New Contact')).toBe('add-new-contact')
  })

  it('strips leading/trailing separators and collapses symbols', () => {
    expect(slugify('  Hello -- World!! ')).toBe('hello-world')
  })

  it('falls back to "test" for empty input', () => {
    expect(slugify('!!!')).toBe('test')
  })
})
