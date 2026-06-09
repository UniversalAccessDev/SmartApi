import { StepRule } from '../types'
import { lit } from '../../utils/literal'
import { unquote } from '../text'

/**
 * Resolve a navigation target into an absolute URL, or null if the text is not
 * URL-like (so a named target falls through to a nav-link click). Handles full
 * scheme URLs (keeping spaces in query strings), mailto:/tel:, absolute paths,
 * and bare domains (prefixing https://).
 */
const toUrl = (raw: string): string | null => {
  let t = unquote(raw.trim())
    .replace(/[.,!?]+$/, '')
    .trim()
  // Strip leading filler: "the deep link", "the URL", "the page at", "the address"
  t = t
    .replace(
      /^(?:the\s+)?(?:deep\s+link|url|link|web\s*page|page\s+at|address|site|website)\s+/i,
      '',
    )
    .trim()
  // Strip trailing asides/targets: "(staging)", "in a new tab", "in the background".
  t = t
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+in\s+(?:a\s+|the\s+)?(?:new|background|same|another)\s+(?:tab|window)$/i, '')
    .trim()
  // Encode spaces so a query string with spaces stays ONE url (never truncate).
  const enc = (u: string): string => u.replace(/ /g, '%20')
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return enc(t) // full scheme URL
  if (/^(?:about:|data:|blob:)/i.test(t)) return t
  if (/^(?:mailto:|tel:)/i.test(t)) return t.split(/\s/)[0]
  if (t.startsWith('/')) return enc(t) // absolute path (keep the whole query)
  const bare = /^((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/\S*)?)/i.exec(t)
  if (bare) return `https://${enc(bare[1].replace(/^www\./i, ''))}`
  // host:port like localhost:3000/admin
  const hostPort = /^(localhost(?::\d+)?(?:\/\S*)?)/i.exec(t)
  if (hostPort) return `https://${enc(hostPort[1])}`
  return null
}

/**
 * Sub-navigation within a test, e.g. "go to https://...", "navigate to /settings".
 * Only matches URL-like targets so it never competes with named link/nav steps.
 */
export const navigateRule: StepRule = {
  name: 'navigate',
  description: 'Navigates to a URL or path: "go to <url>", "navigate to <path>", "visit <url>"',
  apply(step) {
    const match = /^(?:go to|navigate to|visit|open|load|browse to)\s+(.+)$/i.exec(step.trim())
    if (!match) return null

    const url = toUrl(match[1])
    if (!url) return null // named target -> let a nav-link rule handle it

    return {
      lines: [`await page.goto(${lit(url)})`],
      strategies: ['url'],
      assumptions: [],
      confidence: 0.9,
    }
  },
}

/**
 * Browser back: "go back", "navigate back", "click the back button".
 * Deliberately does NOT match "back to <named page>" — that's a link click,
 * handled by the nav-link rules.
 */
export const goBackRule: StepRule = {
  name: 'go-back',
  description: 'Navigates back: "go back", "navigate back", "press the back button"',
  apply(step) {
    if (
      !/^(?:go|navigate|press|click|hit)?\s*(?:the\s+)?(?:browser'?s?\s+)?back(?:\s+button)?$/i.test(
        step.trim(),
      )
    ) {
      return null
    }
    return {
      lines: ['await page.goBack()'],
      strategies: ['url'],
      assumptions: [],
      confidence: 0.85,
    }
  },
}

/** Browser forward: "go forward", "navigate forward". */
export const goForwardRule: StepRule = {
  name: 'go-forward',
  description: 'Navigates forward: "go forward", "navigate forward"',
  apply(step) {
    if (!/^(?:go|navigate|press|click)?\s*(?:the\s+)?forward(?:\s+button)?$/i.test(step.trim())) {
      return null
    }
    return {
      lines: ['await page.goForward()'],
      strategies: ['url'],
      assumptions: [],
      confidence: 0.85,
    }
  },
}

/** Reload: "reload the page", "refresh", "refresh the page". */
export const reloadRule: StepRule = {
  name: 'reload',
  description: 'Reloads the page: "reload", "refresh", "reload the page"',
  apply(step) {
    if (!/^(?:reload|refresh)(?:\s+the)?(?:\s+page)?$/i.test(step.trim())) return null
    return { lines: ['await page.reload()'], strategies: ['url'], assumptions: [], confidence: 0.9 }
  },
}
