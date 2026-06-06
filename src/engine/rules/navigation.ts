import { StepRule } from '../types'
import { lit } from '../../utils/literal'

/**
 * Sub-navigation within a test, e.g. "go to https://...", "navigate to /settings".
 * Only matches URL-like targets so it never competes with click/link steps.
 */
export const navigateRule: StepRule = {
  name: 'navigate',
  description: 'Navigates to a URL or path: "go to <url>", "navigate to <path>", "visit <url>"',
  apply(step) {
    const match = /^(?:go to|navigate to|visit|open)\s+(\S+)$/i.exec(step.trim())
    if (!match) return null

    const target = match[1]
    const looksLikeUrl = /^https?:\/\//i.test(target) || target.startsWith('/')
    if (!looksLikeUrl) return null

    return {
      lines: [`await page.goto(${lit(target)})`],
      strategies: ['url'],
      assumptions: [],
      confidence: 0.9,
    }
  },
}

/** Browser back: "go back", "navigate back", "click the back button". */
export const goBackRule: StepRule = {
  name: 'go-back',
  description: 'Navigates back: "go back", "navigate back", "press the back button"',
  apply(step) {
    if (
      !/^(?:go|navigate|press|click)?\s*(?:the\s+)?back(?:\s+button)?(?:\s+to\s+.*)?$/i.test(
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
