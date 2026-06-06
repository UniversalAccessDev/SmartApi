import { StepRule } from '../types'
import { lit } from '../../utils/literal'

/**
 * Natural-language rules — common ways real QA engineers phrase steps that don't
 * fit the more literal rules. These intentionally make reasonable inferences and
 * always record an assumption so the caller can verify the locator.
 */

// ─── Navigation naturalizations ──────────────────────────────────────────────

/** "Go to the settings page", "navigate to the checkout page" -> click nav link. */
export const navToPageRule: StepRule = {
  name: 'nav-to-page',
  description: 'Navigates via a nav link: "go to/open the <name> page"',
  apply(step) {
    const m = /^(?:go to|navigate to|open|visit)\s+(?:the\s+)?(.+?)\s+page$/i.exec(step.trim())
    if (!m) return null
    const name = m[1].trim()
    return {
      lines: [`await page.getByRole('link', { name: ${lit(name)} }).click()`],
      strategies: ['role'],
      assumptions: [`Assumed a navigation link named "${name}"; use page.goto() if it is a URL.`],
      confidence: 0.6,
    }
  },
}

/** "Go to the homepage", "go home". */
export const goHomeRule: StepRule = {
  name: 'go-home',
  description: 'Navigates to the site root: "go to the homepage", "go home"',
  apply(step) {
    if (!/^(?:go to|navigate to|open|visit|go)\s+(?:the\s+)?home\s?(?:page)?$/i.test(step.trim())) {
      return null
    }
    return {
      lines: [`await page.goto('/')`],
      strategies: ['url'],
      assumptions: ['Assumed the homepage is the site root "/"; change to the full URL if needed.'],
      confidence: 0.6,
    }
  },
}

/** Pagination next: "go to the next page", "click next". */
export const nextPageRule: StepRule = {
  name: 'next-page',
  description: 'Pagination next: "go to the next page", "click next"',
  apply(step) {
    if (!/^(?:go to\s+(?:the\s+)?|click\s+)?next(?:\s+page)?$/i.test(step.trim())) return null
    return {
      lines: [`await page.getByRole('link', { name: /next/i }).click()`],
      strategies: ['role'],
      assumptions: ['Assumed a "Next" pagination link; switch to a button if appropriate.'],
      confidence: 0.6,
    }
  },
}

/** Pagination/back previous: "go to the previous page", "previous page". */
export const prevPageRule: StepRule = {
  name: 'previous-page',
  description: 'Goes to the previous page: "go to the previous page"',
  apply(step) {
    if (!/^(?:go to\s+(?:the\s+)?|click\s+)?previous(?:\s+page)?$/i.test(step.trim())) return null
    return {
      lines: [`await page.goBack()`],
      strategies: ['url'],
      assumptions: [
        'Interpreted "previous page" as browser back; use a Prev link if it is pagination.',
      ],
      confidence: 0.58,
    }
  },
}

/** Generic "open the X [menu/dropdown/modal/panel]" -> click. */
export const openElementRule: StepRule = {
  name: 'open-element',
  description: 'Opens a UI element: "open the user menu", "open the settings modal"',
  apply(step) {
    if (/\bnew\s+(?:tab|window)\b/i.test(step)) return null // browser-level, leave unmapped
    const m =
      /^open\s+(?:the\s+|a\s+|an\s+)?(.+?)(?:\s+(?:menu|dropdown|modal|dialog|panel|drawer|popup|popover|flyout))?$/i.exec(
        step.trim(),
      )
    if (!m) return null
    const name = m[1].trim()
    return {
      lines: [`await page.getByRole('button', { name: ${lit(name)} }).click()`],
      strategies: ['role'],
      assumptions: [`Assumed "${name}" opens via a button; adjust the role/locator if needed.`],
      confidence: 0.55,
    }
  },
}

// ─── Action naturalizations ──────────────────────────────────────────────────

const btnRegex = (re: string) => `await page.getByRole('button', { name: ${re} }).click()`

/** "Submit the form". */
export const submitFormRule: StepRule = {
  name: 'submit-form',
  description: 'Submits a form: "submit the form"',
  apply(step) {
    if (!/^submit(\s+the)?\s+form$/i.test(step.trim())) return null
    return {
      lines: [btnRegex('/submit/i')],
      strategies: ['role'],
      assumptions: ['Assumed a submit button matching /submit/i.'],
      confidence: 0.62,
    }
  },
}

/** "Add the item to the cart", "add the first product to the basket". */
export const addToCartRule: StepRule = {
  name: 'add-to-cart',
  description: 'Adds to cart: "add the item to the cart"',
  apply(step) {
    if (!/^add\s+.+\s+to\s+(?:the\s+)?(?:cart|basket|bag)$/i.test(step.trim())) return null
    return {
      lines: [btnRegex('/add to (?:cart|basket|bag)/i')],
      strategies: ['role'],
      assumptions: ['Assumed an "Add to cart" button; scope to a product if multiple exist.'],
      confidence: 0.6,
    }
  },
}

/** "Proceed to checkout", "go to checkout", "checkout". */
export const checkoutRule: StepRule = {
  name: 'checkout',
  description: 'Proceeds to checkout: "proceed to checkout"',
  apply(step) {
    if (!/^(?:proceed to|go to|continue to)?\s*(?:the\s+)?check\s?out$/i.test(step.trim())) {
      return null
    }
    return {
      lines: [btnRegex('/check ?out/i')],
      strategies: ['role'],
      assumptions: ['Assumed a "Checkout" button/link.'],
      confidence: 0.6,
    }
  },
}

/** "Place the order", "place order". */
export const placeOrderRule: StepRule = {
  name: 'place-order',
  description: 'Places an order: "place the order"',
  apply(step) {
    if (!/^place\s+(?:the\s+)?order$/i.test(step.trim())) return null
    return {
      lines: [btnRegex('/place order/i')],
      strategies: ['role'],
      assumptions: ['Assumed a "Place order" button.'],
      confidence: 0.6,
    }
  },
}

/** "Remove the product from the cart". */
export const removeFromCartRule: StepRule = {
  name: 'remove-from-cart',
  description: 'Removes from cart: "remove the product from the cart"',
  apply(step) {
    if (!/^remove\s+.+\s+from\s+(?:the\s+)?(?:cart|basket|bag)$/i.test(step.trim())) return null
    return {
      lines: [btnRegex('/remove/i')],
      strategies: ['role'],
      assumptions: ['Assumed a "Remove" button; scope to the right line item if multiple exist.'],
      confidence: 0.58,
    }
  },
}

/** "Accept cookies", "accept all cookies". */
export const acceptCookiesRule: StepRule = {
  name: 'accept-cookies',
  description: 'Accepts a cookie banner: "accept cookies"',
  apply(step) {
    if (!/^accept\s+(?:all\s+)?cookies$/i.test(step.trim())) return null
    return {
      lines: [btnRegex('/accept/i')],
      strategies: ['role'],
      assumptions: ['Assumed an "Accept" cookie button.'],
      confidence: 0.62,
    }
  },
}

/** "Sort by name", "sort by price". */
export const sortByRule: StepRule = {
  name: 'sort-by',
  description: 'Sorts a table: "sort by <column>"',
  apply(step) {
    const m = /^sort\s+by\s+(.+)$/i.exec(step.trim())
    if (!m) return null
    return {
      lines: [`await page.getByRole('columnheader', { name: ${lit(m[1].trim())} }).click()`],
      strategies: ['role'],
      assumptions: [
        `Assumed clicking the "${m[1].trim()}" column header sorts; adjust if it is a control.`,
      ],
      confidence: 0.55,
    }
  },
}

/** "Switch on notifications", "turn off dark mode". */
export const switchToggleRule: StepRule = {
  name: 'switch-toggle',
  description: 'Toggles a switch: "switch on/off <name>", "turn on/off <name>"',
  apply(step) {
    const on = /^(?:switch|turn)\s+on\s+(?:the\s+)?(.+)$/i.exec(step.trim())
    if (on) {
      const name = on[1].trim()
      return {
        lines: [`await page.getByLabel(${lit(name)}).check()`],
        strategies: ['label'],
        assumptions: [`Assumed "${name}" is a labelled switch/toggle.`],
        confidence: 0.62,
      }
    }
    const off = /^(?:switch|turn)\s+off\s+(?:the\s+)?(.+)$/i.exec(step.trim())
    if (off) {
      const name = off[1].trim()
      return {
        lines: [`await page.getByLabel(${lit(name)}).uncheck()`],
        strategies: ['label'],
        assumptions: [`Assumed "${name}" is a labelled switch/toggle.`],
        confidence: 0.62,
      }
    }
    return null
  },
}

/** "Choose a file", "select a file". */
export const chooseFileRule: StepRule = {
  name: 'choose-file',
  description: 'Opens a file input: "choose a file"',
  apply(step) {
    if (!/^(?:choose|select|pick)\s+(?:a\s+)?file$/i.test(step.trim())) return null
    return {
      lines: [`await page.locator('input[type="file"]').setInputFiles('path/to/file')`],
      strategies: ['label'],
      assumptions: ['Targeted the first file input; replace "path/to/file" with a real file path.'],
      confidence: 0.55,
    }
  },
}

// ─── Assertion naturalizations ───────────────────────────────────────────────

/** "Verify I am on the checkout page", "verify the user is on the dashboard". */
export const onPageRule: StepRule = {
  name: 'assert-on-page',
  description: 'Asserts the current page: "verify I am on the <name> page"',
  apply(step) {
    const m =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:i\s*(?:'m| am)|the\s+user\s+is|we\s+are|you\s+are)\s+on\s+(?:the\s+)?(.+?)(?:\s+page)?$/i.exec(
        step.trim(),
      )
    if (!m) return null
    const name = m[1].trim()
    return {
      lines: [
        `await expect(page).toHaveURL(new RegExp(${lit(name.replace(/[^a-z0-9]/gi, '.*'))}, 'i'))`,
      ],
      strategies: ['url'],
      assumptions: [
        `Assumed the ${name} page URL contains "${name}"; tighten the pattern if needed.`,
      ],
      confidence: 0.58,
    }
  },
}

/** "Verify the modal is closed", "make sure the dialog is closed". */
export const modalClosedRule: StepRule = {
  name: 'assert-modal-closed',
  description: 'Asserts a modal/dialog is closed: "verify the modal is closed"',
  apply(step) {
    if (
      !/^(?:verify|assert|ensure|confirm|check|make sure)\s+(?:that\s+)?(?:the\s+)?(?:modal|dialog|popup|overlay)\s+is\s+(?:closed|dismissed|gone|not\s+(?:visible|shown))$/i.test(
        step.trim(),
      )
    ) {
      return null
    }
    return {
      lines: [`await expect(page.getByRole('dialog')).toBeHidden()`],
      strategies: ['role'],
      assumptions: ['Asserted the dialog role is hidden; adjust if the modal has no dialog role.'],
      confidence: 0.62,
    }
  },
}

/** "Verify there are no results", "verify no results are shown". */
export const noResultsRule: StepRule = {
  name: 'assert-no-results',
  description: 'Asserts an empty state: "verify there are no results"',
  apply(step) {
    if (
      !/^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:there\s+are\s+)?no\s+(?:results|items|records|matches|rows|data)(?:\s+(?:are\s+)?(?:shown|found|visible|displayed))?$/i.test(
        step.trim(),
      )
    ) {
      return null
    }
    return {
      lines: [
        `await expect(page.getByText(/no results|no items|nothing found|no records/i)).toBeVisible()`,
      ],
      strategies: ['text'],
      assumptions: [
        'Assumed an empty-state message matching /no results/i; adjust to your app text.',
      ],
      confidence: 0.58,
    }
  },
}

/** "Verify the success message", "confirm the error message", "the toast says Saved". */
export const messageRule: StepRule = {
  name: 'assert-message',
  description: 'Asserts a status message: "verify the success message", "the toast says <text>"',
  apply(step) {
    const says =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:the\s+)?(?:toast|message|alert|notification|banner|snackbar)\s+says\s+(.+)$/i.exec(
        step.trim(),
      )
    if (says) {
      return {
        lines: [`await expect(page.getByText(${lit(says[1].trim())})).toBeVisible()`],
        strategies: ['text'],
        assumptions: [],
        confidence: 0.64,
      }
    }
    const kind =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:the\s+)?(success|error|warning|confirmation|info)\s+(?:message|toast|alert|notification)(?:\s+(?:appears?|is\s+(?:shown|visible|displayed)))?$/i.exec(
        step.trim(),
      )
    if (kind) {
      const word = kind[1].toLowerCase()
      return {
        lines: [`await expect(page.getByText(new RegExp(${lit(word)}, 'i'))).toBeVisible()`],
        strategies: ['text'],
        assumptions: [
          `Assumed the ${word} message contains the word "${word}"; use getByRole('alert') for a more robust check.`,
        ],
        confidence: 0.56,
      }
    }
    return null
  },
}

// ─── Wait naturalizations ────────────────────────────────────────────────────

/** "Wait for the page to load", "wait for the page to finish loading". */
export const waitForLoadRule: StepRule = {
  name: 'wait-for-load',
  description: 'Waits for page load: "wait for the page to load"',
  apply(step) {
    if (
      !/^wait\s+for\s+(?:the\s+)?page\s+to\s+(?:load|finish loading|be ready)$/i.test(step.trim())
    ) {
      return null
    }
    return {
      lines: [`await page.waitForLoadState('networkidle')`],
      strategies: [],
      assumptions: [],
      confidence: 0.7,
    }
  },
}

// ─── Auth naturalizations ────────────────────────────────────────────────────

/** "Sign in with Google", "continue with Apple", "log in with GitHub". */
export const socialLoginRule: StepRule = {
  name: 'social-login',
  description: 'Social/SSO login: "sign in with Google", "continue with Apple"',
  apply(step) {
    const m =
      /^(?:sign in|log in|continue|signup|sign up)\s+with\s+(google|apple|facebook|github|microsoft|twitter|linkedin|gitlab|slack|okta|sso|google account|apple id)$/i.exec(
        step.trim(),
      )
    if (!m) return null
    const provider = m[1].trim()
    return {
      lines: [
        `await page.getByRole('button', { name: new RegExp(${lit(provider)}, 'i') }).click()`,
      ],
      strategies: ['role'],
      assumptions: [`Assumed a "${provider}" SSO button.`],
      confidence: 0.62,
    }
  },
}

/** "Register a new account", "sign up", "create an account". */
export const registerRule: StepRule = {
  name: 'register',
  description: 'Registers: "register a new account", "sign up", "create an account"',
  apply(step) {
    if (
      !/^(?:register(?:\s+(?:a\s+)?(?:new\s+)?account)?|sign\s?up|create\s+(?:a\s+|an\s+)?(?:new\s+)?account)$/i.test(
        step.trim(),
      )
    ) {
      return null
    }
    return {
      lines: [
        `await page.getByRole('button', { name: /sign ?up|register|create account/i }).click()`,
      ],
      strategies: ['role'],
      assumptions: ['Assumed a sign-up/register button.'],
      confidence: 0.6,
    }
  },
}

/** "Reset my password", "forgot password". */
export const forgotPasswordRule: StepRule = {
  name: 'forgot-password',
  description: 'Opens password reset: "reset my password", "forgot password"',
  apply(step) {
    if (!/^(?:reset|forgot)\s+(?:my\s+|the\s+|your\s+)?password\??$/i.test(step.trim())) return null
    return {
      lines: [`await page.getByRole('link', { name: /forgot|reset/i }).click()`],
      strategies: ['role'],
      assumptions: ['Assumed a "Forgot/Reset password" link.'],
      confidence: 0.6,
    }
  },
}

// ─── More action naturalizations ─────────────────────────────────────────────

/** "Increase the quantity", "decrease the count". */
export const incrementRule: StepRule = {
  name: 'increment',
  description: 'Steps a numeric control: "increase/decrease the <name>"',
  apply(step) {
    const inc = /^(?:increase|increment|add\s+one\s+to)\s+(?:the\s+)?(.+)$/i.exec(step.trim())
    if (inc) {
      return {
        lines: [`await page.getByRole('button', { name: /increase|increment|plus|\\+/i }).click()`],
        strategies: ['role'],
        assumptions: [`Assumed a "+"/increase button for "${inc[1].trim()}".`],
        confidence: 0.55,
      }
    }
    const dec = /^(?:decrease|decrement|reduce|subtract\s+one\s+from)\s+(?:the\s+)?(.+)$/i.exec(
      step.trim(),
    )
    if (dec) {
      return {
        lines: [`await page.getByRole('button', { name: /decrease|decrement|minus|-/i }).click()`],
        strategies: ['role'],
        assumptions: [`Assumed a "-"/decrease button for "${dec[1].trim()}".`],
        confidence: 0.55,
      }
    }
    return null
  },
}

/** "Move the slider to 50", "set the slider to 75". */
export const sliderRule: StepRule = {
  name: 'slider',
  description: 'Sets a slider: "move/set the slider to <n>"',
  apply(step) {
    const m = /^(?:move|set|drag)\s+(?:the\s+)?(?:.+?\s+)?slider\s+to\s+(\d+)$/i.exec(step.trim())
    if (!m) return null
    return {
      lines: [`await page.getByRole('slider').fill(${lit(m[1])})`],
      strategies: ['role'],
      assumptions: ['Assumed a single range slider; scope the locator if there are several.'],
      confidence: 0.58,
    }
  },
}

/** "Select all rows", "select all items", "select all". */
export const selectAllRule: StepRule = {
  name: 'select-all',
  description: 'Selects all: "select all rows", "select all"',
  apply(step) {
    if (
      !/^(?:select|check)\s+all(?:\s+(?:rows|items|records|checkboxes|entries))?$/i.test(
        step.trim(),
      )
    ) {
      return null
    }
    return {
      lines: [`await page.getByRole('checkbox', { name: /select all/i }).check()`],
      strategies: ['role'],
      assumptions: ['Assumed a "Select all" header checkbox.'],
      confidence: 0.6,
    }
  },
}

const ROW_ORD: Record<string, string> = { first: '.first()', last: '.last()' }

/** "Delete the last row", "delete the first row". */
export const deleteRowRule: StepRule = {
  name: 'delete-row',
  description: 'Deletes a table row: "delete the first/last row"',
  apply(step) {
    const m = /^(?:delete|remove)\s+the\s+(first|last|\d+(?:st|nd|rd|th))\s+row$/i.exec(step.trim())
    if (!m) return null
    const ord = m[1].toLowerCase()
    let sel = ROW_ORD[ord]
    if (!sel) {
      const n = parseInt(ord, 10)
      sel = Number.isFinite(n) && n > 0 ? `.nth(${n - 1})` : '.first()'
    }
    return {
      lines: [
        `await page.getByRole('row')${sel}.getByRole('button', { name: /delete|remove/i }).click()`,
      ],
      strategies: ['role'],
      assumptions: [`Acted on the ${ord} row's delete control; verify the row index/locator.`],
      confidence: 0.6,
    }
  },
}

/** "Apply the discount code SAVE10", "apply coupon SAVE10". */
export const couponRule: StepRule = {
  name: 'coupon',
  description: 'Applies a coupon: "apply the discount code <code>"',
  apply(step) {
    const m =
      /^apply\s+(?:the\s+)?(?:discount\s+code|coupon(?:\s+code)?|promo(?:\s+code)?|voucher)\s+(.+)$/i.exec(
        step.trim(),
      )
    if (!m) return null
    const code = m[1].trim()
    return {
      lines: [
        `await page.getByLabel(/coupon|promo|discount|voucher/i).fill(${lit(code)})`,
        `await page.getByRole('button', { name: /apply/i }).click()`,
      ],
      strategies: ['label', 'role'],
      assumptions: ['Assumed a coupon input + "Apply" button; adjust locators to the app.'],
      confidence: 0.55,
    }
  },
}

/** "Filter by active", "filter by status". */
export const filterByRule: StepRule = {
  name: 'filter-by',
  description: 'Applies a filter: "filter by <value>"',
  apply(step) {
    const m = /^filter\s+by\s+(.+)$/i.exec(step.trim())
    if (!m) return null
    return {
      lines: [`await page.getByRole('button', { name: ${lit(m[1].trim())} }).click()`],
      strategies: ['role'],
      assumptions: [
        `Assumed a "${m[1].trim()}" filter control (button); adjust if it is a select.`,
      ],
      confidence: 0.52,
    }
  },
}

// ─── More assertion / wait naturalizations ───────────────────────────────────

/** "Verify the total is $50", "verify the price is 19.99". */
export const totalIsRule: StepRule = {
  name: 'assert-total',
  description: 'Asserts a value is visible: "verify the total is <value>"',
  apply(step) {
    const m =
      /^(?:verify|assert|ensure|confirm|check)\s+(?:that\s+)?(?:the\s+)?(?:total|subtotal|grand total|price|amount|balance|count|quantity)\s+is\s+(.+)$/i.exec(
        step.trim(),
      )
    if (!m) return null
    return {
      lines: [`await expect(page.getByText(${lit(m[1].trim())})).toBeVisible()`],
      strategies: ['text'],
      assumptions: [
        `Asserted the value "${m[1].trim()}" is visible; scope to the total element if ambiguous.`,
      ],
      confidence: 0.58,
    }
  },
}

/** "The page should load", "the page should finish loading". */
export const pageShouldLoadRule: StepRule = {
  name: 'page-should-load',
  description: 'Waits for load: "the page should load"',
  apply(step) {
    if (!/^the\s+page\s+should\s+(?:load|finish loading|be loaded|be ready)$/i.test(step.trim())) {
      return null
    }
    return {
      lines: [`await page.waitForLoadState('networkidle')`],
      strategies: [],
      assumptions: [],
      confidence: 0.6,
    }
  },
}

/** "Wait 3 seconds" — translated to a load-state wait (never a hard timeout). */
export const waitSecondsRule: StepRule = {
  name: 'wait-seconds',
  description: 'Discourages hard waits: "wait 3 seconds" -> a web-first load wait',
  apply(step) {
    if (
      !/^wait\s+(?:for\s+)?\d+\s*(?:seconds?|secs?|s|minutes?|mins?|ms|milliseconds?)$/i.test(
        step.trim(),
      )
    ) {
      return null
    }
    return {
      lines: [`await page.waitForLoadState('networkidle')`],
      strategies: [],
      assumptions: [
        'Fixed waits are an anti-pattern; replaced with a network-idle wait. Prefer "wait for <element>".',
      ],
      confidence: 0.55,
    }
  },
}
