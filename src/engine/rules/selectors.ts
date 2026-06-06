import { StepRule } from '../types'
import { lit } from '../../utils/literal'

/**
 * Legacy escape hatches.
 *
 * Modern apps expose roles/labels, but legacy apps often don't — so these rules
 * let a step name a raw CSS / XPath / #id selector (which can target ANY element)
 * and act inside iframes. They run at the highest priority so an explicit
 * selector is never re-interpreted by the semantic rules.
 */

/** True if the text is an explicit CSS / XPath / id selector. */
export const isSelector = (s: string): boolean =>
  /^(?:css=|xpath=|#|\.[a-z[]|\[|\/\/|\(\/\/)/i.test(s.trim())

/** Convert an explicit selector phrase into a `page.locator(...)` expression. */
const toLocator = (raw: string): { expr: string; strategy: 'css' | 'xpath' } => {
  const s = raw.trim().replace(/^["'`]|["'`]$/g, '')
  if (/^xpath=/i.test(s)) return { expr: `page.locator(${lit(s)})`, strategy: 'xpath' }
  if (/^css=/i.test(s))
    return { expr: `page.locator(${lit(s.replace(/^css=/i, ''))})`, strategy: 'css' }
  if (/^\(?\/\//.test(s)) return { expr: `page.locator(${lit('xpath=' + s)})`, strategy: 'xpath' }
  return { expr: `page.locator(${lit(s)})`, strategy: 'css' }
}

const selectorNote = (sel: string) =>
  `Used an explicit selector "${sel}"; prefer a role/label locator when the app exposes one.`

/** Click by raw selector: "click #submit", "click the element with xpath //a". */
export const selectorClickRule: StepRule = {
  name: 'click-selector',
  description: 'Clicks a raw selector: "click #submit", "click the element with css/xpath <sel>"',
  apply(step) {
    const s = step.trim()
    let sel: string | null = null

    const withForm =
      /^(?:click|tap|press|hit|double[-\s]?click)\s+(?:on\s+)?(?:the\s+)?element\s+(?:with|matching|by|using)\s+(?:the\s+)?(?:css(?:\s+selector)?|xpath|selector|locator)\s+(.+)$/i.exec(
        s,
      )
    if (withForm) sel = withForm[1].trim()
    else {
      const short =
        /^(?:click|tap|press|hit)\s+(?:on\s+)?(?:the\s+)?(.+?)(?:\s+(?:element|button|link|field|input))?$/i.exec(
          s,
        )
      if (short && isSelector(short[1])) sel = short[1].trim()
    }
    if (!sel) return null

    const { expr, strategy } = toLocator(sel)
    return {
      lines: [`await ${expr}.click()`],
      strategies: [strategy],
      assumptions: [selectorNote(sel)],
      confidence: 0.8,
    }
  },
}

/** Fill by raw selector: "fill #email with x", "type x into .search-input". */
export const selectorFillRule: StepRule = {
  name: 'fill-selector',
  description: 'Fills a raw selector: "fill #email with <value>", "type <value> into .search"',
  apply(step) {
    const s = step.trim()
    const mk = (sel: string, val: string) => {
      const { expr, strategy } = toLocator(sel.trim())
      return {
        lines: [`await ${expr}.fill(${lit(val.trim())})`],
        strategies: [strategy],
        assumptions: [selectorNote(sel.trim())],
        confidence: 0.8,
      }
    }

    // field-first: "fill <sel> with <value>" / "set <sel> to <value>"
    const fieldFirst =
      /^(?:fill(?:\s+in)?|set|enter|input)\s+(?:the\s+)?(\S+)\s+(?:with|to)\s+(.+)$/i.exec(s)
    if (fieldFirst && isSelector(fieldFirst[1])) return mk(fieldFirst[1], fieldFirst[2])

    // value-first: "type <value> in/into <sel>"
    const valueFirst = /^(?:type|enter|input)\s+(.+?)\s+(?:in|into)\s+(?:the\s+)?(\S+)$/i.exec(s)
    if (valueFirst && isSelector(valueFirst[2])) return mk(valueFirst[2], valueFirst[1])

    return null
  },
}

/**
 * Act inside an iframe (common in legacy apps / embedded payment widgets):
 *   "click Pay in the payment iframe"
 *   "in the #checkout frame, fill Card Number with 4242"
 */
export const iframeRule: StepRule = {
  name: 'iframe',
  description: 'Acts inside an iframe: "click <X> in the <frame> iframe"',
  apply(step) {
    const s = step.trim()
    let frame: string | null = null
    let inner: string | null = null

    const leading = /^(?:in|inside|within)\s+(?:the\s+)?(.+?)\s+(?:iframe|frame),?\s+(.+)$/i.exec(s)
    if (leading) {
      frame = leading[1].trim()
      inner = leading[2].trim()
    } else {
      const trailing = /^(.+?)\s+(?:in|inside|within)\s+(?:the\s+)?(.+?)\s+(?:iframe|frame)$/i.exec(
        s,
      )
      if (trailing) {
        inner = trailing[1].trim()
        frame = trailing[2].trim()
      }
    }
    if (!frame || !inner) return null

    const frameSel = isSelector(frame) ? frame : `iframe[name="${frame}"]`
    const fl = `page.frameLocator(${lit(frameSel)})`
    const note = `Scoped to iframe "${frame}"; adjust the frame locator if it has no name.`

    const clickM = /^click\s+(?:on\s+)?(?:the\s+)?(.+?)(?:\s+(button|link))?$/i.exec(inner)
    if (clickM) {
      const role = clickM[2] ? clickM[2].toLowerCase() : 'button'
      return {
        lines: [`await ${fl}.getByRole('${role}', { name: ${lit(clickM[1].trim())} }).click()`],
        strategies: ['frame', 'role'],
        assumptions: [note],
        confidence: 0.6,
      }
    }
    const fillM = /^(?:fill|enter|type|input)\s+(.+?)\s+(?:with|as)\s+(.+)$/i.exec(inner)
    if (fillM) {
      return {
        lines: [`await ${fl}.getByLabel(${lit(fillM[1].trim())}).fill(${lit(fillM[2].trim())})`],
        strategies: ['frame', 'label'],
        assumptions: [note],
        confidence: 0.58,
      }
    }
    return null
  },
}
