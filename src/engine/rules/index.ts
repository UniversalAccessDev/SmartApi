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
import { selectorClickRule, selectorFillRule, iframeRule } from './selectors'
import {
  navToPageRule,
  goHomeRule,
  nextPageRule,
  prevPageRule,
  openElementRule,
  submitFormRule,
  addToCartRule,
  checkoutRule,
  placeOrderRule,
  removeFromCartRule,
  acceptCookiesRule,
  sortByRule,
  switchToggleRule,
  chooseFileRule,
  onPageRule,
  modalClosedRule,
  noResultsRule,
  messageRule,
  waitForLoadRule,
  waitSecondsRule,
  socialLoginRule,
  registerRule,
  forgotPasswordRule,
  incrementRule,
  sliderRule,
  selectAllRule,
  deleteRowRule,
  couponRule,
  filterByRule,
  totalIsRule,
  pageShouldLoadRule,
} from './natural'

/**
 * Ordered rule registry. The engine applies these top-to-bottom and uses the
 * first rule that matches a step, so more specific rules come before generic
 * ones (e.g. assertions and key presses before the catch-all click).
 *
 * To extend Smart API: write a new StepRule and drop it into this list at the
 * right priority — no other file needs to change.
 */
export const RULES: StepRule[] = [
  // Legacy escape hatches — explicit CSS/XPath/#id selectors & iframes run FIRST
  // so a raw selector is never re-interpreted by the semantic rules below.
  iframeRule,
  selectorClickRule,
  selectorFillRule,

  // Navigation
  navigateRule,
  goBackRule,
  goForwardRule,
  reloadRule,
  goHomeRule,
  navToPageRule,
  nextPageRule,
  prevPageRule,

  pressKeyRule,

  // Authentication — social/SSO and register/forgot before the credential login.
  socialLoginRule,
  registerRule,
  forgotPasswordRule,
  authLoginRule,
  authLogoutRule,
  authVerifyLoggedInRule,
  authVerifyLoggedOutRule,

  // Assertions — specific (page / modal / message / row / heading / state /
  // value / attribute / count) BEFORE the broad visibility & contains asserts.
  assertUrlRule,
  assertTitleRule,
  onPageRule,
  modalClosedRule,
  noResultsRule,
  messageRule,
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
  totalIsRule,
  assertVisibleRule,
  assertContainsRule,

  // Waits — load/seconds naturalizations before the generic wait-for assertion.
  pageShouldLoadRule,
  waitForLoadRule,
  waitSecondsRule,
  waitForRule,

  // Forms — placeholder fill before generic label fill.
  placeholderFillRule,
  fillRule,
  radioRule,
  selectRule,
  checkRule,
  uncheckRule,
  switchToggleRule,
  sliderRule,
  clearFieldRule,
  fileUploadRule,
  chooseFileRule,
  focusRule,

  // Actions (natural) — specific intents before the generic click variants.
  submitFormRule,
  addToCartRule,
  checkoutRule,
  placeOrderRule,
  removeFromCartRule,
  deleteRowRule,
  selectAllRule,
  couponRule,
  acceptCookiesRule,
  incrementRule,
  sortByRule,
  filterByRule,

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
  openElementRule,
  hoverRule,
  scrollRule,
  closeOverlayRule,
  clickRule,
]
