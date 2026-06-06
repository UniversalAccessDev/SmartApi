/**
 * A realistic corpus of plain-English QA steps used to measure and guard the
 * engine's coverage. Grow this over time with real cases from users — it is the
 * primary signal for how "natural" the engine is.
 *
 * `mappable: true`  -> the engine SHOULD translate this to a Playwright action.
 * `mappable: false` -> intentionally out of scope (ambiguous, backend-only, or
 *                      browser/window-level); the engine should honestly leave
 *                      it unmapped (TODO + warning) rather than guess.
 */
export interface CorpusEntry {
  step: string
  mappable: boolean
}

export const CORPUS: CorpusEntry[] = [
  // navigation
  { step: 'Go to the homepage', mappable: true },
  { step: 'Open the dashboard', mappable: true },
  { step: 'Navigate to the settings page', mappable: true },
  { step: 'Refresh the page', mappable: true },
  { step: 'Go back to the previous page', mappable: true },
  { step: 'Go to the next page', mappable: true },
  // auth
  { step: 'Sign in with Google', mappable: true },
  { step: 'Register a new account', mappable: true },
  { step: 'Reset my password', mappable: true },
  { step: 'Log out of the application', mappable: true },
  { step: 'Log in as an admin', mappable: false }, // which account? ambiguous
  // clicks / icons
  { step: 'Click the submit button', mappable: true },
  { step: 'Tap the menu icon', mappable: true },
  { step: 'Click the hamburger menu', mappable: true },
  { step: 'Click the close icon', mappable: true },
  { step: 'Click the gear icon', mappable: true },
  // forms
  { step: 'Type my email address', mappable: false }, // no value given
  { step: 'Select my country', mappable: false }, // no value given
  { step: 'Pick a date', mappable: false }, // app-specific date picker
  { step: 'Choose a file', mappable: true },
  { step: 'Switch on notifications', mappable: true },
  { step: 'Enable two-factor authentication', mappable: true },
  { step: 'Set the quantity to 5', mappable: true },
  { step: 'Increase the quantity', mappable: true },
  { step: 'Decrease the quantity', mappable: true },
  { step: 'Move the slider to 50', mappable: true },
  { step: 'Fill out the registration form', mappable: false }, // which fields?
  // dropdowns / menus
  { step: 'Open the Country dropdown', mappable: true },
  { step: 'Open the user menu', mappable: true },
  // assertions
  { step: 'Verify the cart is empty', mappable: true },
  { step: 'Verify the total is $50', mappable: true },
  { step: 'Verify there are no results', mappable: true },
  { step: 'Confirm the success message', mappable: true },
  { step: 'Make sure the modal is closed', mappable: true },
  { step: 'Verify the page title contains Dashboard', mappable: true },
  { step: 'Verify I am on the checkout page', mappable: true },
  { step: 'Verify the toast says Saved', mappable: true },
  { step: 'The page should load', mappable: true },
  { step: 'The button should be red', mappable: false }, // CSS/color, app-specific
  { step: 'Verify an email was sent', mappable: false }, // backend, no UI signal
  { step: 'The form should be submitted', mappable: false }, // vague
  // waits
  { step: 'Wait for the page to load', mappable: true },
  { step: 'Wait until the results load', mappable: true },
  { step: 'Wait 3 seconds', mappable: true },
  // tables / lists
  { step: 'Sort by name', mappable: true },
  { step: 'Filter by active', mappable: true },
  { step: 'Delete the last row', mappable: true },
  { step: 'Select all rows', mappable: true },
  { step: 'Click the first row', mappable: true },
  // ecommerce
  { step: 'Add the item to the cart', mappable: true },
  { step: 'Proceed to checkout', mappable: true },
  { step: 'Apply the discount code SAVE10', mappable: true },
  { step: 'Remove the product from the cart', mappable: true },
  { step: 'Place the order', mappable: true },
  // misc UI
  { step: 'Hover over the avatar', mappable: true },
  { step: 'Scroll down to the reviews', mappable: true },
  { step: 'Accept cookies', mappable: true },
  { step: 'Close the cookie banner', mappable: true },
  { step: 'Dismiss the notification', mappable: true },
  { step: 'Take a screenshot', mappable: true },
  { step: 'Clear the search', mappable: true },
  // legacy escape hatches — raw selectors + iframes
  { step: 'Click #login-button', mappable: true },
  { step: 'Click .submit-btn', mappable: true },
  { step: 'Fill #email with jane@test.com', mappable: true },
  { step: 'Click the element with xpath //table//button', mappable: true },
  { step: 'Click Pay in the payment iframe', mappable: true },

  // genuinely out of scope (browser/window/OS-level)
  { step: 'Switch to the second tab', mappable: false },
  { step: 'Open a new tab', mappable: false },
  { step: 'Maximize the window', mappable: false },
  { step: 'Zoom in', mappable: false },
  { step: 'Copy the link', mappable: false },
]
