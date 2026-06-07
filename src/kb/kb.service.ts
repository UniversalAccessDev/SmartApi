import { KbDatabase } from './db'
import { buildLocator, LocatorSpec } from './locator'
import { lit } from '../utils/literal'
import { LocatorStrategy, RuleOutput } from '../engine/types'

// Only strip true noise words. Keep "in/on/to" etc. — they're meaningful in UI
// labels ("sign in", "log in", "opt in") and conflating them causes mismatches.
const STOPWORDS = new Set(['the', 'a', 'an', 'my', 'your'])

/** Normalize a phrase for matching: lowercase, strip punctuation & stopwords. */
export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t))
    .join(' ')

export interface TeachInput extends LocatorSpec {
  phrases: string[]
  page?: string
}

export type Provenance = 'taught' | 'recorded'

export interface KbEntry {
  phrase: string
  norm: string
  locator: string
  strategy: string
  page: string | null
  hits: number
}

/** Teach an org one or more phrases that all resolve to the same element. */
export const teach = (
  db: KbDatabase,
  org: string,
  input: TeachInput,
  provenance: Provenance = 'taught',
): { learned: string[]; locator: string; strategy: LocatorStrategy } => {
  const built = buildLocator(input)
  if (!built) {
    throw new Error('A locator is required (role/label/placeholder/text/testid/css).')
  }
  const now = new Date().toISOString()
  // Upsert by (org, norm): re-teaching or re-harvesting a phrase replaces the
  // old locator so the KB is self-correcting and never accumulates duplicates.
  const del = db.prepare(`DELETE FROM kb_entries WHERE org = ? AND norm = ?`)
  const stmt = db.prepare(
    `INSERT INTO kb_entries (org, phrase, norm, locator, strategy, page, provenance, hits, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  )
  const learned: string[] = []
  const tx = db.transaction((phrases: string[]) => {
    for (const phrase of phrases) {
      const norm = normalize(phrase)
      if (!norm) continue
      del.run(org, norm)
      stmt.run(
        org,
        phrase,
        norm,
        built.expr,
        built.strategy,
        input.page ?? null,
        provenance,
        now,
        now,
      )
      learned.push(phrase)
    }
  })
  tx(input.phrases)
  return { learned, locator: built.expr, strategy: built.strategy }
}

/** Remove all KB entries for an org (reset). Returns the number of rows deleted. */
export const clearOrg = (db: KbDatabase, org: string): number =>
  db.prepare(`DELETE FROM kb_entries WHERE org = ?`).run(org).changes

/** Batch-ingest captured elements (e.g. from a recorder/explorer). */
export const learn = (
  db: KbDatabase,
  org: string,
  elements: TeachInput[],
): { elements: number; phrases: number; skipped: number } => {
  // No outer transaction here: each teach() is already atomic, and nesting
  // transactions around a loop that intentionally swallows errors miscounts.
  let phrases = 0
  let skipped = 0
  for (const item of elements) {
    try {
      phrases += teach(db, org, item, 'recorded').learned.length
    } catch {
      skipped += 1 // element with no usable locator — skip, keep going
    }
  }
  return { elements: elements.length - skipped, phrases, skipped }
}

export const getEntries = (db: KbDatabase, org: string): KbEntry[] =>
  db
    .prepare(
      `SELECT phrase, norm, locator, strategy, page, hits FROM kb_entries WHERE org = ? ORDER BY hits DESC, id ASC`,
    )
    .all(org) as KbEntry[]

// ─── Step resolution against the KB ──────────────────────────────────────────

interface ParsedStep {
  action: 'click' | 'fill' | 'check' | 'assert-visible'
  target: string
  value?: string
}

/** Parse the action + target out of a step so we can match the target to the KB. */
const parseStep = (step: string): ParsedStep | null => {
  const s = step.trim()
  let m: RegExpExecArray | null

  if ((m = /^(?:fill(?:\s+in)?|set)\s+(?:the\s+)?(.+?)\s+(?:with|to)\s+(.+)$/i.exec(s))) {
    return { action: 'fill', target: m[1], value: m[2] }
  }
  if ((m = /^(?:enter|type|input)\s+(.+?)\s+(?:in|into)\s+(?:the\s+)?(.+)$/i.exec(s))) {
    return { action: 'fill', target: m[2], value: m[1] }
  }
  if ((m = /^(?:click|tap|press|hit)\s+(?:on\s+)?(?:the\s+)?(.+)$/i.exec(s))) {
    return { action: 'click', target: m[1] }
  }
  if ((m = /^(?:check|tick|enable)\s+(?:the\s+)?(.+)$/i.exec(s))) {
    return { action: 'check', target: m[1] }
  }
  if (
    (m =
      /^(?:verify|ensure|confirm|assert|check)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+(?:appears?|is\s+visible|is\s+displayed|is\s+shown)$/i.exec(
        s,
      ))
  ) {
    return { action: 'assert-visible', target: m[1] }
  }
  return null
}

/** Find the best KB entry for a target phrase (exact, then token-subset). */
const matchEntry = (target: string, entries: KbEntry[]): KbEntry | null => {
  const tn = normalize(target)
  if (!tn) return null
  const tset = new Set(tn.split(' '))

  const exact = entries.filter((e) => e.norm === tn)
  if (exact.length) return exact[0] // already ordered by hits

  // User wrote a shorter form ("Login") of a taught phrase ("login button").
  let subset = entries.filter((e) => {
    const pset = new Set(e.norm.split(' '))
    return [...tset].every((t) => pset.has(t))
  })
  // Or a longer form ("the main login button") of a taught phrase ("login button").
  if (!subset.length) {
    subset = entries.filter((e) => e.norm.split(' ').every((t) => tset.has(t)))
  }
  return subset.length ? subset[0] : null
}

/**
 * Build a per-step resolver bound to an org's KB entries. Returns a RuleOutput
 * when the step targets a known element, else null (engine falls back to rules).
 */
export const makeResolver =
  (entries: KbEntry[]) =>
  (step: string): RuleOutput | null => {
    if (!entries.length) return null
    const parsed = parseStep(step)
    if (!parsed) return null
    const entry = matchEntry(parsed.target, entries)
    if (!entry) return null

    const loc = entry.locator
    let lines: string[]
    switch (parsed.action) {
      case 'click':
        lines = [`await ${loc}.click()`]
        break
      case 'fill':
        lines = [`await ${loc}.fill(${lit(parsed.value ?? '')})`]
        break
      case 'check':
        lines = [`await ${loc}.check()`]
        break
      case 'assert-visible':
        lines = [`await expect(${loc}).toBeVisible()`]
        break
    }
    return {
      lines,
      strategies: [entry.strategy as LocatorStrategy],
      assumptions: [],
      confidence: 0.95,
    }
  }
