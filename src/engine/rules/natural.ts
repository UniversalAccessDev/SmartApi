import { StepRule } from '../types'
import { lit } from '../../utils/literal'
import { cleanLabel, cleanValue, looksLikeAssertion } from '../text'

// ─── Coverage rules (close common gaps) ──────────────────────────────────────

/** Bare login/logout: "Log in", "Sign in", "Login to the app". */
export const bareLoginRule: StepRule = {
  name: 'bare-login',
  description: 'Logs in (no credentials given): "log in", "sign in"',
  apply(step) {
    if (!/^(?:log\s?in|sign\s?in)(?:\s+(?:to|into)\s+.+)?$/i.test(step.trim())) return null
    return {
      lines: [`await page.getByRole('button', { name: /log ?in|sign ?in/i }).click()`],
      strategies: ['role'],
      assumptions: ['Assumed a login/sign-in button (no credentials were given).'],
      confidence: 0.58,
    }
  },
}

/**
 * Conditional action: "If the cookie banner appears, accept cookies",
 * "When a popup is visible, close it", "If the modal shows up, click Dismiss".
 * Emits a guarded single-line statement; resolves the inner action through the
 * full registry so any supported action can be the conditional body.
 */
export const conditionalRule: StepRule = {
  name: 'conditional',
  description: 'Runs an action only if an element is visible: "if <X> appears, <action>"',
  apply(step, ctx) {
    const m =
      /^(?:if|when)\s+(.+?)\s+(?:appears?|is\s+(?:visible|present|shown|displayed)|shows?\s+up|pops?\s+up|is\s+there|exists?)\s*,?\s+(?:then\s+)?(.+)$/i.exec(
        step.trim(),
      )
    if (!m || !ctx.resolveStep) return null
    const guard = cleanLabel(m[1])
    const actionPhrase = m[2].trim().replace(/^then\s+/i, '')
    const inner = ctx.resolveStep(actionPhrase)
    if (!inner || inner.lines.length === 0) return null

    const guardLoc = `page.getByText(${lit(guard)})`
    const body = inner.lines.length === 1 ? inner.lines[0] : `{ ${inner.lines.join('; ')} }`
    return {
      lines: [`if (await ${guardLoc}.isVisible()) ${body}`],
      strategies: ['text', ...inner.strategies],
      assumptions: [
        `Conditional: the action runs only if "${guard}" is visible (no error if it is absent).`,
        ...inner.assumptions,
      ],
      confidence: Math.min(inner.confidence, 0.6),
    }
  },
}

/** "Check all the checkboxes", "turn off every toggle", "uncheck all boxes". */
export const allCheckboxesRule: StepRule = {
  name: 'check-all',
  description: 'Checks/unchecks every checkbox or toggle: "check all the checkboxes"',
  apply(step) {
    const m =
      /^(?:check|tick|select|enable|uncheck|untick|deselect|clear|disable|turn\s+off|turn\s+on)\s+(?:all|every|each)\s+(?:of\s+)?(?:the\s+)?(check\s*box(?:es)?|box(?:es)?|toggle(?:s)?|switch(?:es)?)$/i.exec(
        step.trim(),
      )
    if (!m) return null
    const uncheck = /^(?:uncheck|untick|deselect|clear|disable|turn\s+off)/i.test(step.trim())
    const role = /toggle|switch/i.test(m[1]) ? 'switch' : 'checkbox'
    const method = uncheck ? 'uncheck' : 'check'
    return {
      lines: [`for (const el of await page.getByRole('${role}').all()) await el.${method}()`],
      strategies: ['role'],
      assumptions: [`Looped ${method}() over every ${role} on the page.`],
      confidence: 0.55,
    }
  },
}

/**
 * Data extraction: "read the cart total", "extract the order number as orderId",
 * "get the value of the Email field". Emits a read statement the executor turns
 * into an `extract` action that returns the captured value.
 */
export const extractRule: StepRule = {
  name: 'extract',
  description: 'Reads a value off the page: "read the <X>", "extract the <X> as <name>"',
  apply(step) {
    // "capture a screenshot" is a screenshot, not a data read.
    if (/\b(?:screenshot|screen\s?shot|snapshot|video|screencast)\b/i.test(step)) return null
    const m =
      /^(?:read|extract|capture|grab|record)\s+(?:the\s+)?(?:(?:text|value|content|number|count|total|price|amount)\s+of\s+(?:the\s+)?)?(.+?)(?:\s+(?:as|into|to)\s+([A-Za-z_]\w*))?$/i.exec(
        step.trim(),
      )
    if (!m) return null
    const rawTarget = m[1]
    const asName = m[2] || null
    const isInput = /\b(?:field|input|textbox)$/i.test(rawTarget.trim()) || /\bvalue\b/i.test(step)
    const name = cleanLabel(rawTarget)
    if (!name) return null
    const loc = isInput ? `getByLabel(${lit(name)})` : `getByText(${lit(name)})`
    const prop = isInput ? 'inputValue' : 'textContent'
    return {
      lines: [`await page.${loc}.${prop}()${asName ? ` // as ${asName}` : ''}`],
      strategies: [isInput ? 'label' : 'text'],
      assumptions: [`Reads the ${isInput ? 'value' : 'text'} of "${name}".`],
      confidence: 0.6,
    }
  },
}

/** "Confirm the deletion", "Cancel", "Click Yes". */
export const confirmCancelRule: StepRule = {
  name: 'confirm-cancel',
  description: 'Confirms/cancels a dialog: "confirm the deletion", "cancel", "click Yes/No"',
  apply(step) {
    const s = step.trim()
    // Never turn an assertion ("confirm the total reads $5") or an ecommerce
    // order step ("confirm and place my order") into a generic dialog click.
    if (looksLikeAssertion(s)) return null
    const ecommerceTail = /\b(?:order|place|checkout|payment|purchase|cart)\b/i.test(s)
    if (
      /^(?:click\s+)?(?:the\s+)?(?:confirm(?:ation)?|yes|ok)(?:\s+button)?$/i.test(s) ||
      (/^confirm\s+(?:the\s+)?[\w ]{1,30}$/i.test(s) && !ecommerceTail)
    ) {
      return {
        lines: [`await page.getByRole('button', { name: /confirm|yes|ok/i }).click()`],
        strategies: ['role'],
        assumptions: ['Assumed a Confirm/Yes/OK button; adjust if the label differs.'],
        confidence: 0.55,
      }
    }
    if (
      /^(?:click\s+)?(?:the\s+)?(?:cancel|no)(?:\s+button)?$/i.test(s) ||
      /^cancel\s+(?:the\s+)?[\w ]{1,30}$/i.test(s)
    ) {
      return {
        lines: [`await page.getByRole('button', { name: /cancel|no/i }).click()`],
        strategies: ['role'],
        assumptions: ['Assumed a Cancel/No button; adjust if the label differs.'],
        confidence: 0.55,
      }
    }
    return null
  },
}

/** "Choose Male", "Select Premium" — pick an option/radio/card by visible text. */
export const chooseOptionRule: StepRule = {
  name: 'choose-option',
  description: 'Picks an option by text: "choose <name>", "select <name>" (no "from")',
  apply(step) {
    const m = /^(?:choose|select|pick)\s+(?:the\s+)?(.+)$/i.exec(step.trim())
    if (!m) return null
    const name = cleanValue(m[1])
    return {
      lines: [`await page.getByText(${lit(name)}).click()`],
      strategies: ['text'],
      assumptions: [
        `Assumed "${name}" is a clickable option/radio/card; for a native <select> use "select ${name} from <field>".`,
      ],
      confidence: 0.55,
    }
  },
}

/** Generic navigation to a named section via a nav link: "go to Reports". */
export const navToGenericRule: StepRule = {
  name: 'nav-to',
  description: 'Navigates via a nav link: "go to <name>", "navigate to <name>"',
  apply(step) {
    const m = /^(?:go to|navigate to|visit)\s+(?:the\s+)?(.+)$/i.exec(step.trim())
    if (!m) return null
    const name = cleanLabel(m[1])
    return {
      lines: [`await page.getByRole('link', { name: ${lit(name)} }).click()`],
      strategies: ['role'],
      assumptions: [`Assumed "${name}" is a navigation link; use page.goto() if it is a URL.`],
      confidence: 0.55,
    }
  },
}

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

/** "Open/switch to the Reports tab", "click the Settings tab" -> role=tab. */
export const tabRule: StepRule = {
  name: 'select-tab',
  description: 'Activates a tab: "open the <name> tab", "switch to the <name> tab"',
  apply(step) {
    if (/\bnew\s+(?:tab|window)\b/i.test(step)) return null // browser-level, out of scope
    const m =
      /^(?:open|click(?:\s+on)?|select|switch to|go to|navigate to|activate|view)\s+(?:the\s+)?(.+?)\s+tab$/i.exec(
        step.trim(),
      )
    if (!m) return null
    const name = cleanLabel(m[1])
    // Ordinals ("second", "3rd", "last") are positional -> let the nth-click rule handle them.
    if (
      /^(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|next|previous|\d+(?:st|nd|rd|th)?)$/i.test(
        name,
      )
    ) {
      return null
    }
    return {
      lines: [`await page.getByRole('tab', { name: ${lit(name)} }).click()`],
      strategies: ['role'],
      assumptions: [`Assumed "${name}" is a tab (role="tab").`],
      confidence: 0.7,
    }
  },
}

/** "Select Male for Gender", "choose Express for shipping" -> radio option. */
export const radioForRule: StepRule = {
  name: 'radio-for',
  description: 'Selects a radio option: "select <option> for <group>"',
  apply(step) {
    const m = /^(?:select|choose|pick|set)\s+(?:the\s+)?(.+?)\s+for\s+(?:the\s+)?(.+?)$/i.exec(
      step.trim(),
    )
    if (!m) return null
    const value = cleanValue(m[1])
    const group = cleanLabel(m[2])
    return {
      lines: [`await page.getByRole('radio', { name: ${lit(value)} }).check()`],
      strategies: ['role'],
      assumptions: [
        `Assumed "${value}" is a radio option for "${group}"; use getByLabel('${group}').selectOption() if it is a <select>.`,
      ],
      confidence: 0.58,
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

const CART = '(?:shopping\\s+)?(?:cart|basket|bag)'

/** "Add to cart", "Add the item to my basket", "Put it in the bag". */
export const addToCartRule: StepRule = {
  name: 'add-to-cart',
  description: 'Adds to cart: "add to cart", "add the item to my basket", "put it in the bag"',
  apply(step) {
    const s = step.trim()
    if (
      !new RegExp(`^add\\s+to\\s+(?:the\\s+|my\\s+|your\\s+)?${CART}$`, 'i').test(s) &&
      !new RegExp(
        `^(?:add|put|place|drop|toss|throw)(?:\\s+.+?)?\\s+(?:to|in|into)\\s+(?:the\\s+|my\\s+|your\\s+)?${CART}$`,
        'i',
      ).test(s)
    ) {
      return null
    }
    return {
      lines: [btnRegex('/add to (?:cart|basket|bag)/i')],
      strategies: ['role'],
      assumptions: ['Assumed an "Add to cart" button; scope to a product if multiple exist.'],
      confidence: 0.6,
    }
  },
}

/** "Proceed to checkout", "continue to payment", "check out as a guest". */
export const checkoutRule: StepRule = {
  name: 'checkout',
  description: 'Proceeds to checkout: "proceed to checkout", "continue to payment"',
  apply(step) {
    const s = step.trim()
    const checkout =
      /^(?:proceed to|go to|continue to|move to)?\s*(?:the\s+)?check\s?out(?:\s+(?:as\s+a\s+guest|now))?$/i.test(
        s,
      )
    const payment = /^(?:proceed|continue|go|move)\s+to\s+(?:the\s+)?payment$/i.test(s)
    if (!checkout && !payment) return null
    return {
      lines: [btnRegex(payment ? '/payment|continue/i' : '/check ?out/i')],
      strategies: ['role'],
      assumptions: [`Assumed a "${payment ? 'Payment/Continue' : 'Checkout'}" button/link.`],
      confidence: 0.6,
    }
  },
}

/** "Place the order", "submit my order", "complete the purchase". */
export const placeOrderRule: StepRule = {
  name: 'place-order',
  description: 'Places an order: "place the order", "submit order", "complete purchase"',
  apply(step) {
    if (
      !/^(?:place|submit|complete|finalize|confirm)\s+(?:the\s+|my\s+)?(?:order|purchase)$/i.test(
        step.trim(),
      )
    ) {
      return null
    }
    return {
      lines: [btnRegex('/place order|submit order|complete (?:order|purchase)|buy now/i')],
      strategies: ['role'],
      assumptions: ['Assumed a "Place order" button.'],
      confidence: 0.6,
    }
  },
}

/** "Remove the product from the cart", "delete the line item". */
export const removeFromCartRule: StepRule = {
  name: 'remove-from-cart',
  description: 'Removes from cart: "remove the product from the cart", "delete the line item"',
  apply(step) {
    const s = step.trim()
    if (
      !new RegExp(`^remove\\s+.+\\s+from\\s+(?:the\\s+|my\\s+)?${CART}$`, 'i').test(s) &&
      !/^(?:remove|delete)\s+(?:the\s+)?(?:line\s+item|item|product)$/i.test(s)
    ) {
      return null
    }
    return {
      lines: [btnRegex('/remove|delete/i')],
      strategies: ['role'],
      assumptions: ['Assumed a "Remove" button; scope to the right line item if multiple exist.'],
      confidence: 0.58,
    }
  },
}

/** "Empty the cart", "clear my basket", "remove all items". */
export const emptyCartRule: StepRule = {
  name: 'empty-cart',
  description: 'Empties the cart: "empty the cart", "clear my basket", "remove all items"',
  apply(step) {
    const s = step.trim()
    if (
      !new RegExp(`^(?:empty|clear)\\s+(?:the\\s+|my\\s+|your\\s+)?${CART}$`, 'i').test(s) &&
      !/^remove\s+all\s+(?:the\s+)?items(?:\s+from\s+(?:the\s+|my\s+)?(?:cart|basket|bag))?$/i.test(
        s,
      )
    ) {
      return null
    }
    return {
      lines: [btnRegex('/empty (?:cart|basket|bag)|clear (?:cart|basket|bag)|remove all/i')],
      strategies: ['role'],
      assumptions: ['Assumed an "Empty cart" button; some apps require removing each line item.'],
      confidence: 0.55,
    }
  },
}

/** "Add to wishlist", "save for later", "add to favorites". */
export const wishlistRule: StepRule = {
  name: 'wishlist',
  description: 'Saves an item: "add to wishlist", "save for later", "add to favorites"',
  apply(step) {
    const s = step.trim()
    if (
      !/^(?:add|save)(?:\s+.+?)?\s+to\s+(?:the\s+|my\s+|your\s+)?(?:wish\s?list|favou?rites|saved\s+items)$/i.test(
        s,
      ) &&
      !/^save\s+(?:it\s+|this\s+|the\s+item\s+)?for\s+later$/i.test(s)
    ) {
      return null
    }
    return {
      lines: [btnRegex('/wish ?list|save for later|favou?rite|save/i')],
      strategies: ['role'],
      assumptions: ['Assumed a "Wishlist/Save for later" button.'],
      confidence: 0.55,
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
    const s = step.trim()
    let name: string | null = null
    let action: 'on' | 'off' | 'toggle' | null = null
    let m: RegExpExecArray | null
    // on/off BEFORE the name: "turn on dark mode", "switch off notifications"
    if (
      (m =
        /^(?:switch|turn|toggle|flip)\s+(on|off)\s+(?:the\s+)?(.+?)(?:\s+(?:switch|toggle))?$/i.exec(
          s,
        ))
    ) {
      action = m[1].toLowerCase() as 'on' | 'off'
      name = m[2]
    } else if (
      // on/off AFTER the name: "toggle the Dark Mode switch on", "turn notifications off"
      (m =
        /^(?:switch|turn|toggle|flip)\s+(?:the\s+)?(.+?)(?:\s+(?:switch|toggle))?\s+(on|off)$/i.exec(
          s,
        ))
    ) {
      name = m[1]
      action = m[2].toLowerCase() as 'on' | 'off'
    } else if ((m = /^(?:toggle|flip)\s+(?:the\s+)?(.+?)(?:\s+(?:switch|toggle))?$/i.exec(s))) {
      // bare "toggle X" -> flip with a click
      name = m[1]
      action = 'toggle'
    }
    if (!name || !action) return null
    const clean = cleanLabel(name)
    const method = action === 'off' ? 'uncheck()' : action === 'on' ? 'check()' : 'click()'
    return {
      lines: [`await page.getByRole('switch', { name: ${lit(clean)} }).${method}`],
      strategies: ['role'],
      assumptions: [
        `Assumed "${clean}" is a switch (role="switch"); use getByLabel() if it is a plain checkbox.`,
      ],
      confidence: 0.62,
    }
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
    const s = step.trim()
    const PROVIDER = 'google|apple|facebook|github|microsoft|twitter|linkedin|gitlab|slack|okta|sso'
    const m =
      new RegExp(
        `^(?:sign in|log in|continue|signup|sign up|register|authenticate)\\s+(?:with|via|using)\\s+(?:my\\s+|your\\s+|an?\\s+)?(${PROVIDER})(?:\\s+(?:account|id))?$`,
        'i',
      ).exec(s) ||
      // "use Google to sign in", "use my Google account"
      new RegExp(
        `^use\\s+(?:my\\s+|your\\s+)?(${PROVIDER})(?:\\s+account)?\\s+to\\s+(?:sign|log)\\s?in$`,
        'i',
      ).exec(s)
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
  description:
    'Sets a slider: "move/set the <name> slider to <n>%", "drag the slider to the right"',
  apply(step) {
    const s = step.trim()
    const sliderLoc = (name: string): string =>
      name ? `page.getByRole('slider', { name: ${lit(name)} })` : `page.getByRole('slider')`

    // Directional: "drag the brightness slider all the way to the right"
    const dir =
      /^(?:move|set|drag|slide|adjust|push)\s+(?:the\s+)?(.*?)\s*slider\s+(?:all\s+the\s+way\s+)?to\s+(?:the\s+)?(right|max(?:imum)?|end|top|left|min(?:imum)?|start|beginning|bottom)$/i.exec(
        s,
      )
    if (dir) {
      const toMax = /right|max|end|top/i.test(dir[2])
      return {
        lines: [`await ${sliderLoc(cleanLabel(dir[1]))}.press(${lit(toMax ? 'End' : 'Home')})`],
        strategies: ['role'],
        assumptions: [`Moved the slider to its ${toMax ? 'maximum' : 'minimum'} via the keyboard.`],
        confidence: 0.55,
      }
    }
    // Numeric/percent: "move the Volume slider to 75%", "set slider to 50"
    const num =
      /^(?:move|set|drag|slide|adjust|change)\s+(?:the\s+)?(.*?)\s*slider\s+to\s+(\d+)\s*%?$/i.exec(
        s,
      )
    if (num) {
      return {
        lines: [`await ${sliderLoc(cleanLabel(num[1]))}.fill(${lit(num[2])})`],
        strategies: ['role'],
        assumptions: ['Assumed a range slider; scope the locator if there are several.'],
        confidence: 0.58,
      }
    }
    return null
  },
}

/**
 * Date/time picker: "pick June 15 from the date picker", "select tomorrow in the
 * Check-in calendar". Routed away from selectRule (a calendar is not a <select>):
 * opens the picker, then clicks the day cell.
 */
export const datePickerRule: StepRule = {
  name: 'date-picker',
  description: 'Picks a date: "pick <date> from the <field> date picker/calendar"',
  apply(step) {
    const m =
      /^(?:pick|select|choose|set|enter)\s+(.+?)\s+(?:from|in|on|for)\s+(?:the\s+)?(.+?)\s+(?:date\s?picker|calendar|datepicker|date\s+field)$/i.exec(
        step.trim(),
      )
    if (!m) return null
    const date = cleanValue(m[1].replace(/['’]s\s+date$/i, '').replace(/\s+date$/i, ''))
    const field = cleanLabel(m[2])
    return {
      lines: [
        `await page.getByLabel(${lit(field)}).click()`,
        `await page.getByRole('gridcell', { name: ${lit(date)} }).click()`,
      ],
      strategies: ['label', 'role'],
      assumptions: [
        `Opened the "${field}" picker and clicked the "${date}" day cell; for relative dates (today/tomorrow) compute the concrete date in the test.`,
      ],
      confidence: 0.5,
    }
  },
}

/**
 * Menu/listbox pick: "select Settings from the profile menu", "choose New York
 * from the suggestions". A menu/listbox is not a native <select>, so route to a
 * menuitem/option click instead of selectOption.
 */
export const menuItemRule: StepRule = {
  name: 'menu-item',
  description: 'Picks a menu/listbox item: "select <item> from the <name> menu/suggestions"',
  apply(step) {
    const m =
      /^(?:select|choose|pick|click(?:\s+on)?|tap)\s+(.+?)\s+(?:from|in)\s+(?:the\s+)?(.+?)\s+(?:menu|context\s+menu|dropdown\s+menu|suggestions?|autocomplete|listbox|options?\s+list)$/i.exec(
        step.trim(),
      )
    if (!m) return null
    const item = cleanValue(m[1])
    const isOption = /suggestion|autocomplete|listbox|option/i.test(step)
    const role = isOption ? 'option' : 'menuitem'
    return {
      lines: [`await page.getByRole('${role}', { name: ${lit(item)} }).click()`],
      strategies: ['role'],
      assumptions: [`Assumed "${item}" is a ${role} (open the menu/list first if needed).`],
      confidence: 0.6,
    }
  },
}

/**
 * OTP / 2FA / verification code: "enter the OTP 123456", "type the 6-digit code
 * 123456". Fills the code field via a tolerant label locator.
 */
export const otpRule: StepRule = {
  name: 'otp-code',
  description: 'Enters an OTP/verification code: "enter the OTP <code>"',
  apply(step) {
    const m =
      /^(?:enter|type|input|fill(?:\s+in)?|key\s+in)\s+(?:the\s+)?(?:\d+[\s-]?digit\s+)?(?:otp|one[\s-]?time\s+(?:code|password|pin)|verification\s+code|2fa\s+code|security\s+code|auth(?:entication)?\s+code|confirmation\s+code|code|pin)\s+(?:is\s+|of\s+|:\s*)?["']?(\d[\d\s-]{2,9}\d)["']?/i.exec(
        step.trim(),
      )
    if (!m) return null
    const code = m[1].replace(/[\s-]/g, '') // join "123 456" / "123-456"
    return {
      lines: [`await page.getByLabel(/otp|code|verification|pin/i).fill(${lit(code)})`],
      strategies: ['label'],
      assumptions: ['Assumed a single OTP/code input; for per-digit boxes, fill each separately.'],
      confidence: 0.58,
    }
  },
}

// ─── Action naturalizations ──────────────────────────────────────────────────

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
      /^(?:apply|enter|use|redeem|add)\s+(?:the\s+)?(?:discount\s+code|coupon(?:\s+code)?|promo(?:\s+code)?|gift\s+card|voucher(?:\s+code)?)\s+(.+)$/i.exec(
        step.trim(),
      )
    if (!m) return null
    // Capture only the code token; ignore trailing "and hit apply", "at checkout".
    const codeToken = /^["']?([A-Za-z0-9][A-Za-z0-9_-]{1,})["']?/.exec(m[1].trim())
    const code = codeToken ? codeToken[1] : m[1].trim().split(/\s+/)[0]
    return {
      lines: [
        `await page.getByLabel(/coupon|promo|discount|voucher|gift\\s*card/i).fill(${lit(code)})`,
        `await page.getByRole('button', { name: /apply|redeem/i }).click()`,
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
      lines: [`await expect(page.getByText(${lit(cleanValue(m[1]))})).toBeVisible()`],
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
    if (
      !/^(?:verify\s+(?:that\s+)?)?the\s+page\s+(?:should\s+(?:load|finish loading|be loaded|be ready)|is\s+(?:loaded|ready))$/i.test(
        step.trim(),
      )
    ) {
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

/**
 * "Wait 2 seconds" -> an explicit fixed delay (page.waitForTimeout). Some legacy
 * stacks (ICEfaces/JSF, slow AJAX) genuinely need a hard wait, so we honor the
 * stated duration. Duration-less waits ("wait for the page to load") are handled
 * by waitForLoadRule instead.
 */
export const waitSecondsRule: StepRule = {
  name: 'wait-seconds',
  description: 'Explicit fixed wait: "wait 2 seconds" -> page.waitForTimeout(2000)',
  apply(step) {
    const m =
      /^(?:wait|pause|sleep|hold\s+on)\s+(?:for\s+)?(?:~|about\s+|approx(?:imately)?\s+)?(\d+(?:\.\d+)?)\s*(milliseconds?|ms|minutes?|mins?|seconds?|secs?|m|s)\b/i.exec(
        step.trim(),
      )
    if (!m) return null
    const n = parseFloat(m[1])
    const unit = m[2].toLowerCase()
    let ms: number
    if (unit === 'ms' || unit.startsWith('millisecond')) ms = n
    else if (unit === 'm' || unit.startsWith('min')) ms = n * 60_000
    else ms = n * 1000 // seconds / secs / s
    ms = Math.round(ms)
    return {
      lines: [`await page.waitForTimeout(${ms})`],
      strategies: [],
      assumptions: [
        'Explicit fixed wait preserved as requested; prefer "wait for <element>" where the app allows it.',
      ],
      confidence: 0.62,
    }
  },
}
