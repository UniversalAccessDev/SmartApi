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
