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
  clipboardRule,
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
  tabRule,
  radioForRule,
  openElementRule,
  submitFormRule,
  addToCartRule,
  checkoutRule,
  placeOrderRule,
  removeFromCartRule,
  emptyCartRule,
  wishlistRule,
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
  datePickerRule,
  menuItemRule,
  otpRule,
  selectAllRule,
  deleteRowRule,
  couponRule,
  filterByRule,
  totalIsRule,
  pageShouldLoadRule,
  conditionalRule,
  extractRule,
  allCheckboxesRule,
  bareLoginRule,
  confirmCancelRule,
  chooseOptionRule,
  navToGenericRule,
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
  // Control flow first — a conditional wraps an inner action, so it must claim
  // the step before any rule tries to match the "if X is visible" prefix.
  conditionalRule,
  extractRule,
  // Quantified check/uncheck ("all the checkboxes") before the single check rule.
  allCheckboxesRule,

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
  clipboardRule,

  // Authentication — social/SSO and register/forgot before the credential login.
  socialLoginRule,
  registerRule,
  forgotPasswordRule,
  authLoginRule,
  authLogoutRule,
  bareLoginRule,
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

  // Forms — specialized widgets + placeholder fill before generic label fill.
  otpRule,
  placeholderFillRule,
  fillRule,
  tabRule,
  radioForRule,
  radioRule,
  datePickerRule,
  menuItemRule,
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
  emptyCartRule,
  removeFromCartRule,
  wishlistRule,
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
  // Broad natural-language fallbacks — last, before the generic click.
  confirmCancelRule,
  navToGenericRule,
  chooseOptionRule,
  clickRule,
]
