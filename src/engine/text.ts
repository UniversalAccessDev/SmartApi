/**
 * Shared text-cleaning helpers used by rules when extracting element names,
 * field labels, values, and assertion text from a step. Centralizing these
 * fixes whole classes of accuracy bugs (stray quotes, leading articles,
 * trailing filler/purpose clauses, echoed element-type nouns).
 */

/**
 * Return the inner text of the FIRST balanced quoted span found anywhere in the
 * string (straight ' " ` or smart “ ” ‘ ’), or null if there is none.
 *
 * This is the highest-leverage cleaning step: when a tester quotes the target
 * ("the button labeled \"Save Changes\""), the quoted span IS the name — so we
 * lift it out instead of leaking the surrounding prose into the locator.
 */
export const extractQuoted = (s: string): string | null => {
  const straight = /(["'`])([^"'`]+?)\1/.exec(s)
  const smart = /[“‘]([^”’]+?)[”’]/.exec(s)
  let best: { index: number; value: string } | null = null
  if (straight) best = { index: straight.index, value: straight[2] }
  if (smart && (!best || smart.index < best.index)) best = { index: smart.index, value: smart[1] }
  return best ? best.value.trim() : null
}

/** Strip a matching pair of surrounding quotes, or stray edge quotes. */
export const unquote = (s: string): string => {
  let t = s.trim()
  // Matching pair: 'x' "x" `x` “x” ‘x’
  const pair = /^(["'`])([\s\S]*)\1$/.exec(t)
  if (pair) return pair[2].trim()
  const smart = /^[“‘]([\s\S]*)[”’]$/.exec(t)
  if (smart) return smart[1].trim()
  // Otherwise drop any stray leading/trailing quote char.
  t = t.replace(/^["'`“‘]+/, '').replace(/["'`”’]+$/, '')
  return t.trim()
}

/** Strip a leading article ("the"/"a"/"an") and possessive ("your"/"my"). */
export const stripArticle = (s: string): string =>
  s
    .trim()
    .replace(/^(?:the|a|an|your|my)\s+/i, '')
    .trim()

// Infinitive verbs that begin a trailing purpose clause ("... to close the form").
// Restricted to verbs so we never truncate noun tails like "Add to Cart".
const PURPOSE_VERBS =
  'close|open|reveal|expand|collapse|view|see|show|hide|display|dismiss|confirm|cancel|submit|continue|proceed|save|delete|remove|edit|access|toggle|load|reload|refresh|complete|finish|start|begin|navigate|return|select|choose|enter|apply|update|change|clear|search|filter|sort|sign|log|go'

// Position/container nouns that begin trailing locational filler.
const POSITION_NOUNS =
  'top|bottom|left|right|upper|lower|nav|navbar|nav bar|navigation|header|footer|sidebar|side ?bar|toolbar|menu ?bar|corner|page|screen|top-right|top-left|bottom-right|bottom-left|dialog|modal|popup|pop-up|form|panel|section|list|table|results|results table|grid|row|card|post|toast|tile|banner|breadcrumb|notification|item|menu'

// Leading "the button labeled / link that reads / element with the text" preamble.
const PREAMBLE =
  /^(?:the\s+)?(?:button|link|element|menu item|item|icon|tab|field|option|checkbox|box|toggle|switch|cell|row|heading|image)\s+(?:labell?ed|that\s+(?:reads?|says?)|which\s+(?:reads?|says?)|with\s+(?:the\s+)?(?:text|label|name|caption|aria[\s-]?label|accessible\s+name)|named|titled|marked|reading|saying)\s+/i

// Trailing element-type noun echoed after the real label ("Coupon Code input").
const ELEMENT_NOUN =
  /\s+(?:field|input|box|textarea|text area|dropdown|drop-?down|picker|combobox|combo box|autocomplete|panel|section|screen|view)$/i

/**
 * Remove surrounding prose so a clean element name remains:
 *  - leading preamble ("the button labeled ...")
 *  - leading article/possessive
 *  - trailing purpose clause ("... to close the form")
 *  - trailing positional filler ("... in the top-right corner")
 *  - trailing parenthetical ("... (top right)")
 * Conservative by design: prefers leaving text over corrupting a real name.
 */
export const stripFiller = (s: string): string => {
  let t = s.trim()
  t = t.replace(PREAMBLE, '')
  t = stripArticle(t)
  // decorative glyphs/arrows anywhere ("Next >>", "Read more →")
  t = t.replace(/\s*(?:»|«|→|←|↑|↓|>>|<<|>>>|→→)\s*/g, ' ').trim()
  // trailing parenthetical ("(heart)", "(+)", "(X)")
  t = t.replace(/\s*\([^)]*\)\s*$/, '').trim()
  // trailing purpose clause: " to <verb> ..."
  t = t.replace(new RegExp(`\\s+to\\s+(?:${PURPOSE_VERBS})\\b.*$`, 'i'), '').trim()
  // trailing positional/container filler: " in/at/on/near/next to the <position> ..."
  t = t
    .replace(
      new RegExp(
        `\\s+(?:in|at|on|near|inside|within|next\\s+to|beside|under|above|below)\\s+(?:the\\s+|a\\s+|an\\s+|my\\s+|its\\s+|each\\s+|every\\s+)?(?:(?:first|last|second|third|fourth|fifth|\\d+(?:st|nd|rd|th)?)\\s+)?(?:[a-z][a-z-]+\\s+)?(?:${POSITION_NOUNS})\\b.*$`,
        'i',
      ),
      '',
    )
    .trim()
  // trailing "from the top/list/results" and "of the table/results" style filler
  t = t.replace(new RegExp(`\\s+(?:from|of)\\s+the\\s+(?:${POSITION_NOUNS})\\b.*$`, 'i'), '').trim()
  // trailing decorative-control noun ("gear icon" -> "gear", "X symbol" -> "X")
  t = t.replace(/\s+(?:icon|glyph|symbol)$/i, '').trim()
  return t || s.trim()
}

/**
 * Clean an element name / field label:
 *  1. if the step quotes the target, that quoted span IS the name;
 *  2. otherwise drop surrounding quotes, preamble, article, filler, and a
 *     trailing echoed element-type noun.
 */
export const cleanLabel = (s: string): string => {
  const quoted = extractQuoted(s)
  if (quoted != null) return quoted
  let t = stripFiller(unquote(s))
  t = t.replace(ELEMENT_NOUN, '').trim()
  return unquote(t).trim() || s.trim()
}

/**
 * Clean a value (data the user types). Prefer a quoted span when present
 * (that's the literal the tester meant); otherwise drop only surrounding quotes
 * and keep articles/content intact.
 */
export const cleanValue = (s: string): string => {
  const quoted = extractQuoted(s)
  if (quoted != null) return quoted
  return unquote(s)
}

/** Clean assertion text to look for: same rules as a label. */
export const cleanText = (s: string): string => cleanLabel(s)

// Common icon-only affordances -> a regex of likely accessible names.
const ICON_AFFORDANCE: Array<[RegExp, string]> = [
  [/\b(?:gear|cog|settings)\b/i, 'settings|gear'],
  [/(?:\bhamburger\b|☰|\bnav(?:igation)?\s+menu\b)/i, 'menu|navigation'],
  [/(?:\bkebab\b|three[\s-]?dot|meatball|⋮|…|\boverflow\b|\bmore\b)/i, 'more|options|menu'],
  [/(?:magnifying\s*glass|🔍|\bsearch\b)/i, 'search'],
  [/(?:\bpencil\b|✏|\bedit\b)/i, 'edit'],
  [/(?:\bheart\b|❤|favou?rite|wishlist)/i, 'favorite|wishlist|like'],
  [/(?:\bbell\b|🔔|notification)/i, 'notifications|alerts'],
  [/(?:\btrash\b|🗑|\bbin\b|\bdelete\b)/i, 'delete|remove|trash'],
  [/(?:\bavatar\b|\bprofile\b|\baccount\b|user\s+menu)/i, 'account|profile|user menu'],
  [/(?:\bclose\b|✕|×|❌)/i, 'close|dismiss'],
  [/(?:\bplus\b|➕|\badd\b)/i, 'add|new'],
  [/(?:\bdownload\b|⬇)/i, 'download'],
  [/(?:\bshare\b)/i, 'share'],
  [/(?:\bfilter\b|funnel)/i, 'filter'],
]

/**
 * If a target reads as an icon-only affordance ("the gear icon", "☰", "kebab
 * menu"), return a regex (source) of likely accessible names; else null. Only
 * fires when the phrase says icon/glyph/symbol or is a bare glyph, so plain text
 * buttons are untouched.
 */
export const iconAffordance = (raw: string): string | null => {
  const name = unquote(raw.trim())
  const hasIconWord = /\b(?:icon|glyph|symbol)\b/i.test(name)
  const isBareGlyph = /^[^\w\s]{1,3}$/.test(name)
  // Phrases that are only ever an icon, never literal button text.
  const distinctive =
    /magnifying\s*glass|\bkebab\b|\bhamburger\b|\bmeatball\b|three[\s-]?dot|⋮|☰|overflow\s+menu/i.test(
      name,
    )
  if (!hasIconWord && !isBareGlyph && !distinctive) return null
  for (const [re, val] of ICON_AFFORDANCE) if (re.test(name)) return val
  return null
}

/**
 * Heuristic: does this step describe an ASSERTION (a check on state) rather than
 * an ACTION? Used by action rules (check/confirm/clear) to bail out so a
 * verification never silently compiles into a destructive .check()/.click().
 *
 * True when the step opens with a verify-ish lead-in AND contains a state
 * predicate ("reads/is/are/has/shows/equals/should/contains/displayed ...").
 * "Confirm the deletion" -> false (action). "Confirm the total reads $5" -> true.
 */
export const looksLikeAssertion = (s: string): boolean => {
  const t = s.trim()
  if (!/^(?:verify|assert|ensure|make sure|confirm|check|expect)\b/i.test(t)) return false
  // A bare "Confirm/Check that ..." is an assertion lead-in.
  if (/^(?:verify|assert|ensure|make sure|confirm|check|expect)\s+(?:that|if)\b/i.test(t))
    return true
  return /\b(?:is|are|was|were|reads?|shows?|displays?|equals?|contains?|includes?|has|have|should|must|matches?|says?|visible|hidden|enabled|disabled|present|empty|blank|checked|selected|focused|correct|displayed|returned?|exists?|stays?|remains?)\b/i.test(
    t,
  )
}
