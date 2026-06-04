import { StepRule } from '../types'
import { navigateRule } from './navigation'
import {
  authLoginRule,
  authLogoutRule,
  authVerifyLoggedInRule,
  authVerifyLoggedOutRule,
} from './authentication'
import {
  assertUrlRule,
  assertTitleRule,
  assertVisibleRule,
  assertContainsRule,
  waitForRule,
} from './assertions'
import { fillRule, checkRule, uncheckRule, selectRule } from './forms'
import { pressKeyRule, hoverRule, closeOverlayRule, clickRule } from './interaction'

/**
 * Ordered rule registry. The engine applies these top-to-bottom and uses the
 * first rule that matches a step, so more specific rules come before generic
 * ones (e.g. assertions and key presses before the catch-all click).
 *
 * To extend Smart API: write a new StepRule and drop it into this list at the
 * right priority — no other file needs to change.
 */
export const RULES: StepRule[] = [
  navigateRule,
  pressKeyRule,
  // Authentication — must precede the generic fill / click / assertion rules
  // so combined login steps expand into the full credential flow.
  authLoginRule,
  authLogoutRule,
  authVerifyLoggedInRule,
  authVerifyLoggedOutRule,
  assertUrlRule,
  assertTitleRule,
  assertVisibleRule,
  assertContainsRule,
  waitForRule,
  fillRule,
  selectRule,
  checkRule,
  uncheckRule,
  hoverRule,
  closeOverlayRule,
  clickRule,
]
