import { StepRule } from '../types'
import { lit } from '../../utils/literal'

/**
 * Authentication rules.
 *
 * These translate high-level auth intents ("log in", "log out", "verify logged
 * in/out") into clean, accessible Playwright actions. They are registered
 * BEFORE the generic fill/click/assertion rules so a combined login step is
 * expanded into the full credential flow instead of being partially matched.
 */

/** Map a credential keyword to the visible field label we generate. */
const identifierLabelFor = (keyword: string): 'Email' | 'Username' => {
  const k = keyword.toLowerCase()
  if (k === 'username' || k === 'user' || k === 'login') return 'Username'
  return 'Email'
}

/**
 * Combined login:
 *   "Login with Email as user@test.com and Password as Secret123"
 *   "Log in with username user@test.com and password Secret123"
 *   "Sign in with Email as user@test.com and Password as Secret123"
 *
 * Emits: fill identifier -> fill password -> click the submit button.
 */
export const authLoginRule: StepRule = {
  name: 'auth-login',
  description:
    'Combined login: "login/sign in with <Email|Username> [as] <value> and <Password> [as] <value>"',
  apply(step) {
    const lead = /^(log\s?in|sign\s?in)\s+with\s+(.+)$/i.exec(step.trim())
    if (!lead) return null

    // Use the user's verb as the submit-button label: "sign in" -> "Sign in".
    const buttonName = /sign/i.test(lead[1]) ? 'Sign in' : 'Login'
    const creds = lead[2].trim()
    let identifierLabel: 'Email' | 'Username' | null = null
    let identifierValue = ''
    let passwordValue = ''
    let hasPassword = false

    // Compact form: "login with user@test.com/Secret123" (id/password, no "and").
    const compact = /^(\S+?)\s*\/\s*(\S+)$/.exec(creds)
    if (compact && !/\b(?:as|and)\b/i.test(creds)) {
      identifierValue = compact[1]
      identifierLabel = identifierValue.includes('@') ? 'Email' : 'Username'
      passwordValue = compact[2]
      hasPassword = true
    } else {
      // Labelled form: "Email as <v> and Password as <v>".
      for (const segment of creds.split(/\s+and\s+/i)) {
        const m =
          /^(email|e-mail|username|user|login|password|pass(?:word)?)\s+(?:as\s+)?(.+?)\s*$/i.exec(
            segment.trim(),
          )
        if (!m) return null // unparseable credential — defer to other rules

        const key = m[1].toLowerCase()
        const value = m[2].trim()

        if (key.startsWith('pass')) {
          passwordValue = value
          hasPassword = true
        } else {
          identifierLabel = identifierLabelFor(key)
          identifierValue = value
        }
      }
    }

    if (!identifierLabel || !hasPassword) return null

    return {
      lines: [
        `await page.getByLabel(${lit(identifierLabel)}).fill(${lit(identifierValue)})`,
        // exact:true so a "Show password" toggle button does not also match.
        `await page.getByLabel('Password', { exact: true }).fill(${lit(passwordValue)})`,
        `await page.getByRole('button', { name: ${lit(buttonName)} }).click()`,
      ],
      strategies: ['role', 'label'],
      assumptions: [
        `Assumed labelled "${identifierLabel}" and "Password" fields and a "${buttonName}" submit button; rename to match the app.`,
      ],
      confidence: 0.82,
    }
  },
}

/**
 * Logout:
 *   "Logout" | "Log out" | "Click Logout" | "Sign out"
 */
export const authLogoutRule: StepRule = {
  name: 'auth-logout',
  description: 'Logout: "logout", "log out", "click logout", "sign out"',
  apply(step) {
    const m = /^(?:click\s+)?(log\s?out|sign\s?out)$/i.exec(step.trim())
    if (!m) return null

    const buttonName = /sign/i.test(m[1]) ? 'Sign out' : 'Logout'
    return {
      lines: [`await page.getByRole('button', { name: ${lit(buttonName)} }).click()`],
      strategies: ['role'],
      assumptions: [`Assumed logout is a button labelled "${buttonName}".`],
      confidence: 0.8,
    }
  },
}

/**
 * Verify the user is logged in:
 *   "Verify user is logged in"
 *   "Verify dashboard appears after login"
 *   "Verify login successful"
 */
export const authVerifyLoggedInRule: StepRule = {
  name: 'auth-verify-logged-in',
  description:
    'Verify logged in: "verify user is logged in", "verify dashboard appears after login", "verify login successful"',
  apply(step) {
    const s = step.trim()
    const matched =
      /^verify\s+(?:the\s+)?user\s+is\s+logged\s+in$/i.test(s) ||
      /^verify\s+(?:the\s+)?dashboard\s+(?:appears?|is\s+visible|loads?)\s*(?:after\s+login)?$/i.test(
        s,
      ) ||
      /^verify\s+(?:the\s+)?login\s+(?:was\s+)?success(?:ful)?$/i.test(s)
    if (!matched) return null

    return {
      lines: [`await expect(page.getByText('Dashboard')).toBeVisible()`],
      strategies: ['text'],
      assumptions: [
        'Assumed visible "Dashboard" text indicates a successful login; adjust to your app\'s post-login signal.',
      ],
      confidence: 0.7,
    }
  },
}

/**
 * Verify the user is logged out:
 *   "Verify user is logged out"
 *   "Verify Login button appears"
 *   "Verify login page appears"
 */
export const authVerifyLoggedOutRule: StepRule = {
  name: 'auth-verify-logged-out',
  description:
    'Verify logged out: "verify user is logged out", "verify Login button appears", "verify login page appears"',
  apply(step) {
    const s = step.trim()
    const matched =
      /^verify\s+(?:the\s+)?user\s+is\s+logged\s+out$/i.test(s) ||
      /^verify\s+(?:the\s+)?login\s+button\s+(?:appears?|is\s+visible)$/i.test(s) ||
      /^verify\s+(?:the\s+)?login\s+page\s+(?:appears?|is\s+visible|loads?)$/i.test(s)
    if (!matched) return null

    return {
      lines: [`await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()`],
      strategies: ['role'],
      assumptions: [
        'Assumed a visible "Login" button indicates the logged-out state; adjust to your app\'s signal.',
      ],
      confidence: 0.7,
    }
  },
}
