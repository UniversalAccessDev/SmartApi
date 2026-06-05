import { StepRule } from '../types'
import { navigateRule, goBackRule, goForwardRule, reloadRule } from './navigation'
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
  assertHiddenRule,
  assertDisabledRule,
  assertEnabledRule,
  assertCheckedRule,
  assertValueRule,
} from './assertions'
import {
  fillRule,
  checkRule,
  uncheckRule,
  selectRule,
  radioRule,
  clearFieldRule,
  fileUploadRule,
} from './forms'
import {
  pressKeyRule,
  hoverRule,
  closeOverlayRule,
  clickRule,
  doubleClickRule,
  rightClickRule,
  searchRule,
  scrollRule,
  focusRule,
} from './interaction'

/**
 * Ordered rule registry. The engine applies these top-to-bottom and uses the
 * first rule that matches a step, so more specific rules come before generic
 * ones (e.g. assertions and key presses before the catch-all click).
 *
 * To extend Smart API: write a new StepRule and drop it into this list at the
 * right priority — no other file needs to change.
 */
export const RULES: StepRule[] = [
  // Navigation
  navigateRule,
  goBackRule,
  goForwardRule,
  reloadRule,

  pressKeyRule,

  // Authentication — before generic fill / click / assertion rules
  authLoginRule,
  authLogoutRule,
  authVerifyLoggedInRule,
  authVerifyLoggedOutRule,

  // Assertions — specific (negative / state / value) BEFORE the broad
  // visibility and contains assertions so they are not mis-matched.
  assertUrlRule,
  assertTitleRule,
  assertHiddenRule,
  assertDisabledRule,
  assertEnabledRule,
  assertCheckedRule,
  assertValueRule,
  assertVisibleRule,
  assertContainsRule,
  waitForRule,

  // Forms
  fillRule,
  radioRule,
  selectRule,
  checkRule,
  uncheckRule,
  clearFieldRule,
  fileUploadRule,
  focusRule,

  // Interaction — specific click variants BEFORE the generic click fallback.
  searchRule,
  doubleClickRule,
  rightClickRule,
  hoverRule,
  scrollRule,
  closeOverlayRule,
  clickRule,
]
