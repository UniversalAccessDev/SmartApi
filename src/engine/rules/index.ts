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
  assertHeadingRule,
  assertImageRule,
  assertFocusedRule,
  assertEmptyRule,
  assertAttributeRule,
  assertCountRule,
} from './assertions'
import {
  fillRule,
  placeholderFillRule,
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
  testIdClickRule,
  textClickRule,
  nthClickRule,
  imageClickRule,
  dragRule,
  expandCollapseRule,
  dialogRule,
  screenshotRule,
} from './interaction'
import { rowActionRule, rowContainsRule } from './tables'

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

  // Assertions — specific (row / heading / image / state / value / attribute /
  // count) BEFORE the broad visibility and contains assertions.
  assertUrlRule,
  assertTitleRule,
  rowContainsRule,
  assertHeadingRule,
  assertImageRule,
  assertEmptyRule,
  assertFocusedRule,
  assertHiddenRule,
  assertDisabledRule,
  assertEnabledRule,
  assertCheckedRule,
  assertValueRule,
  assertAttributeRule,
  assertCountRule,
  assertVisibleRule,
  assertContainsRule,
  waitForRule,

  // Forms — placeholder fill before the generic label fill.
  placeholderFillRule,
  fillRule,
  radioRule,
  selectRule,
  checkRule,
  uncheckRule,
  clearFieldRule,
  fileUploadRule,
  focusRule,

  // Interaction — specific click variants & gestures BEFORE the generic click.
  screenshotRule,
  rowActionRule,
  searchRule,
  testIdClickRule,
  textClickRule,
  nthClickRule,
  imageClickRule,
  doubleClickRule,
  rightClickRule,
  dragRule,
  expandCollapseRule,
  dialogRule,
  hoverRule,
  scrollRule,
  closeOverlayRule,
  clickRule,
]
