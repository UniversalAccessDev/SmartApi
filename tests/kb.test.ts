import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, KbDatabase } from '../src/kb/db'
import { teach, learn, getEntries, makeResolver, normalize, clearOrg } from '../src/kb/kb.service'

let db: KbDatabase
beforeEach(() => {
  db = openDb(':memory:')
})

describe('normalize', () => {
  it('lowercases, strips punctuation and stopwords', () => {
    expect(normalize('The Login Button!')).toBe('login button')
    expect(normalize('Sign-In')).toBe('sign in')
  })
})

describe('teach + getEntries', () => {
  it('stores a role-based locator for multiple phrases', () => {
    const r = teach(db, 'atwallabs', {
      phrases: ['login button', 'sign in button'],
      role: 'button',
      name: 'Sign In Now',
    })
    expect(r.learned).toEqual(['login button', 'sign in button'])
    expect(r.locator).toBe("page.getByRole('button', { name: 'Sign In Now' })")
    const entries = getEntries(db, 'atwallabs')
    expect(entries).toHaveLength(2)
  })

  it('isolates orgs', () => {
    teach(db, 'orgA', { phrases: ['x'], css: '#a' })
    teach(db, 'orgB', { phrases: ['y'], css: '#b' })
    expect(getEntries(db, 'orgA')).toHaveLength(1)
    expect(getEntries(db, 'orgB')).toHaveLength(1)
  })

  it('upserts: re-teaching a phrase replaces the old locator (no duplicates)', () => {
    teach(db, 'o', { phrases: ['sign in button'], role: 'button', name: 'Sign In Now' })
    teach(db, 'o', { phrases: ['sign in button'], role: 'button', name: 'Sign in' })
    const entries = getEntries(db, 'o')
    expect(entries).toHaveLength(1)
    expect(entries[0].locator).toBe("page.getByRole('button', { name: 'Sign in' })")
  })

  it('learn() bulk-ingests and clearOrg() resets', () => {
    const r = learn(db, 'o', [
      { phrases: ['cart'], css: '#cart' },
      { phrases: ['wishlist'], css: '#wishlist' },
      { phrases: ['broken'] } as never, // no locator -> skipped
    ])
    expect(r.elements).toBe(2)
    expect(r.phrases).toBe(2)
    expect(r.skipped).toBe(1)
    expect(clearOrg(db, 'o')).toBe(2)
    expect(getEntries(db, 'o')).toHaveLength(0)
  })

  it('builds css/testid/label locators', () => {
    expect(teach(db, 'o', { phrases: ['search'], css: '#global-search' }).locator).toBe(
      "page.locator('#global-search')",
    )
    expect(teach(db, 'o', { phrases: ['promo'], testid: 'promo-input' }).locator).toBe(
      "page.getByTestId('promo-input')",
    )
    expect(teach(db, 'o', { phrases: ['user'], label: 'User ID' }).locator).toBe(
      "page.getByLabel('User ID')",
    )
  })
})

describe('KB resolver (KB-first generation)', () => {
  const setup = () => {
    teach(db, 'atwallabs', { phrases: ['login button'], role: 'button', name: 'Sign In Now' })
    teach(db, 'atwallabs', { phrases: ['username field'], css: '#txtUser' })
    teach(db, 'atwallabs', { phrases: ['welcome banner'], text: 'Welcome back' })
    return makeResolver(getEntries(db, 'atwallabs'))
  }

  it('resolves a click to the taught locator', () => {
    const out = setup()('Click the login button')
    expect(out?.lines).toEqual(["await page.getByRole('button', { name: 'Sign In Now' }).click()"])
    expect(out?.confidence).toBe(0.95)
  })

  it('matches a shorter phrase (Login -> login button)', () => {
    const out = setup()('Click Login')
    expect(out?.lines[0]).toBe("await page.getByRole('button', { name: 'Sign In Now' }).click()")
  })

  it('resolves a fill (value-first) to a taught css locator', () => {
    const out = setup()('Enter admin in the username field')
    expect(out?.lines).toEqual(["await page.locator('#txtUser').fill('admin')"])
  })

  it('resolves a visibility assertion', () => {
    const out = setup()('Verify the welcome banner appears')
    expect(out?.lines).toEqual(["await expect(page.getByText('Welcome back')).toBeVisible()"])
  })

  it('returns null for unknown phrases (falls back to generic rules)', () => {
    expect(setup()('Click the checkout button')).toBeNull()
  })

  it('empty KB resolver always returns null', () => {
    expect(makeResolver([])('Click the login button')).toBeNull()
  })
})
