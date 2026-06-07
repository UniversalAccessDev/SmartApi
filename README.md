# Smart API

> Smart API turns plain-English QA steps into clean, reliable Playwright TypeScript automation using a specialized rules engine.

A standalone TypeScript + Node.js backend that accepts a test name, a target URL, and plain-English QA steps, then returns CI-ready Playwright TypeScript code.

- **No external AI** — generation is powered by a deterministic rules engine (`smart-api-playwright-rules-v1`).
- **No database** — stateless and pure; the same input always yields the same output.
- **Standalone** — not coupled to any other project.

## Tech stack

Node.js · TypeScript · Express · Zod · dotenv · cors · Prettier

## Project structure

```
src/
  index.ts                     # Server entrypoint (binds the port)
  app.ts                       # Express app factory (no port binding — testable)
  constants.ts                 # Product name, model name, tagline
  config/
    env.ts                     # Zod-validated environment config
  middleware/
    asyncHandler.ts            # Async route -> error forwarding
    errorHandler.ts            # 404 + centralized error envelope
  routes/
    health.routes.ts           # GET /health
    playwright.routes.ts       # POST /api/v1/playwright/generate
  schemas/
    generate.schema.ts         # Zod request contract
  engine/                      # The deterministic rules engine
    types.ts                   # Rule / output / result types
    rulesEngine.ts             # Runs steps through the rule registry
    codeBuilder.ts             # Assembles the final test file
    rules/
      index.ts                 # Ordered rule registry (priority matters)
      navigation.ts            # goto / navigate
      assertions.ts            # visible / url / title / contains / wait-for
      forms.ts                 # fill / check / uncheck / select
      interaction.ts           # press-key / hover / close-overlay / click
  services/
    generator.service.ts       # Pipeline: engine -> build -> format -> validate
    validator.service.ts       # Static quality checks on generated code
  utils/
    formatCode.ts              # Prettier formatting
    literal.ts                 # Safe TS string literals
    slug.ts                    # Screenshot filename slugs
```

## Setup

```bash
npm install
cp .env.example .env   # PORT=4000
```

## Run

```bash
npm run dev     # watch mode (ts-node-dev)
npm run build   # compile to dist/
npm start       # run compiled build
```

Other scripts: `npm run typecheck`, `npm run format`, `npm run format:check`.

## Tests

The rules engine and pipeline are covered by a Vitest suite (`tests/`):

```bash
npm test          # run once
npm run test:watch  # watch mode
```

Coverage includes every rule (navigation, click/role inference, key presses,
fills, check/uncheck/select, assertions, wait→assertion, hover, overlay close),
engine aggregation (confidence averaging, strategy ordering, assumption dedup,
unmatched handling), the validator (including the XPath false-positive
regression), the full async generation pipeline (determinism, screenshots,
the Escape flag, JS fallback), and the Zod request schema.

## API

### `GET /health`

Liveness probe — returns service name, model, and uptime.

### `POST /api/v1/playwright/generate`

**Request body**

| Field                     | Type     | Required | Default        | Notes                                     |
| ------------------------- | -------- | -------- | -------------- | ----------------------------------------- |
| `testName`                | string   | yes      | —              | Used as the `test(...)` title             |
| `url`                     | string   | yes      | —              | Must be a valid URL; the initial `goto`   |
| `steps`                   | string[] | yes      | —              | Plain-English QA steps (min 1)            |
| `language`                | enum     | no       | `"typescript"` | `typescript` \| `javascript`              |
| `includeScreenshots`      | boolean  | no       | `false`        | Adds a `page.screenshot(...)` at the end  |
| `closeOverlaysWithEscape` | boolean  | no       | `false`        | "close/dismiss" steps use the Escape key  |

**Response**

```json
{
  "success": true,
  "model": "smart-api-playwright-rules-v1",
  "tagline": "Smart API turns plain-English QA steps into clean, reliable Playwright TypeScript automation using a specialized rules engine.",
  "language": "typescript",
  "code": "import { test, expect } from '@playwright/test' ...",
  "locatorStrategy": "role-label-text",
  "confidenceScore": 0.78,
  "assumptions": ["..."],
  "warnings": [],
  "validation": { "valid": true, "warnings": [] },
  "meta": {
    "stepsAnalyzed": [{ "step": "Click Add Contact", "rule": "click", "confidence": 0.7 }],
    "unmatchedSteps": [],
    "ruleEngineWarnings": []
  }
}
```

## Test it with curl

```bash
curl http://localhost:4000/health

curl -X POST http://localhost:4000/api/v1/playwright/generate \
  -H "Content-Type: application/json" \
  -d '{
    "testName": "Add new contact",
    "url": "https://atwallabs.com/demo/crm",
    "steps": [
      "Click Add Contact",
      "Enter Full Name as Jane Doe",
      "Enter Email as jane@test.com",
      "Enter Company as TestCo",
      "Click Add Contact",
      "Verify Jane Doe appears in the contacts list"
    ],
    "language": "typescript",
    "includeScreenshots": true,
    "closeOverlaysWithEscape": true
  }'
```

## Per-org Knowledge Base (KB)

Smart API can **learn an org's app vocabulary** so it emits locators proven
against *that* org's UI instead of generic guesses. Knowledge is stored per org
in SQLite (`KB_DB_PATH`, default `data/smart-api.db`). Generation consults the
org KB **first**, then falls back to the rules engine.

Scope a request to an org with the `X-Org-Id` header. Teach a mapping (the
server builds the locator from structured fields — raw locator strings are not
accepted):

```bash
# Teach: on AtwalLabs, "login button" is actually labelled "Sign In Now"
curl -X POST https://smartapi.atwallabs.com/api/v1/kb/atwallabs/teach \
  -H "Content-Type: application/json" -H "x-api-key: <key>" \
  -d '{"phrases":["login button","sign in button"],"role":"button","name":"Sign In Now"}'

# Now generation for that org uses the taught locator:
curl -X POST https://smartapi.atwallabs.com/api/v1/playwright/generate \
  -H "Content-Type: application/json" -H "x-api-key: <key>" -H "X-Org-Id: atwallabs" \
  -d '{"testName":"Login","url":"https://atwallabs.com/login","steps":["Click the login button"]}'
# -> await page.getByRole('button', { name: 'Sign In Now' }).click()   (meta.rule = "kb")
```

Teach endpoints accept one locator strategy: `role`(+`name`), `label`,
`placeholder`, `text`, `testid`, or `css`. Inspect a KB with
`GET /api/v1/kb/:org`. Matching is deterministic (normalized exact, then
token-subset) — **no AI**.

**Bulk learning.** `POST /api/v1/kb/:org/learn` ingests many captured elements at
once (each element is a teach payload). The harvester tool auto-learns a page:

```bash
npm i -D playwright && npx playwright install chromium
node tools/harvest.mjs https://atwallabs.com/login --org atwallabs --key <key> --dry   # preview
node tools/harvest.mjs https://atwallabs.com/login --org atwallabs --key <key>          # learn
```

It opens the page, extracts buttons/links/inputs with their accessible names,
derives phrases, and posts them to `/learn`. (An interactive click-to-tag
recorder can post to the same endpoint.)

## How the rules engine works

Each step is matched against an **ordered registry of rules** (`src/engine/rules/`).
The first rule that matches wins, so specific rules (assertions, key presses) are
tried before the generic `click` fallback. Every rule reports:

- the Playwright statement(s) to emit,
- the locator strategy used (`role`, `label`, `text`, …),
- any assumptions a reviewer should verify,
- a confidence score (averaged across steps into `confidenceScore`).

Supported phrasings (grouped):

- **Navigation** — `go to <url>`, `navigate to <path>`, `go back`, `go forward`,
  `reload` / `refresh the page`
- **Auth** — `login/sign in with Email|Username as <v> and Password as <v>`,
  compact `login with <email>/<password>`, `logout` / `sign out`,
  `verify user is logged in/out` (the submit button label follows the verb:
  "sign in" → "Sign in")
- **Click** — `click <name> [button|link|tab]`, `double-click <target>`,
  `right-click <target>`, `tap <name>`, `hover over <name>`,
  `click on the text <text>`, `click the element with test id <id>`,
  `click the first/second/last <target>`, `click the <alt> image`,
  `close/dismiss the <modal>`
- **Forms** — `enter <field> as <value>` / `fill <field> with <value>` /
  `type <value> in <field>`, `type <value> in the <placeholder> placeholder`,
  `check/uncheck <name>`, `select <option> from <field>`, `choose <name> radio`,
  `clear the <field>`, `upload <file> to <field>`, `focus the <field>`,
  `search for <query>`
- **Tables** — `click <action> in the row for <identifier>`,
  `verify the row for <identifier> contains <text>`
- **Gestures / keyboard / scroll** — `drag <a> to <b>`, `press <key>`,
  `press Ctrl+<key>` / `Cmd+Shift+<key>`, `expand/collapse the <section>`,
  `scroll to <target>`, `scroll to bottom`, `accept/dismiss the alert`,
  `take a screenshot [named <label>]` (also available via the
  `includeScreenshots` request flag, which adds one at the end)
- **Assertions** — `verify <text> appears` / `<text> should be visible`,
  `verify <text> is not visible` / `<text> should disappear`,
  `verify <element> is enabled/disabled`, `verify <name> is checked/unchecked`,
  `verify <field> has value <value>`, `verify the <field> is empty/focused`,
  `verify the heading <text> is visible`, `verify the <alt> image is visible`,
  `verify the <name> link has href <value>`, `verify the table has <N> rows`,
  `verify <N> items are visible`, `verify <area> contains <text>`,
  `verify url is <url>`, `verify title is <title>`, and `wait for <text>`
  (translated into a web-first assertion — **never** `waitForTimeout`).

### Legacy app support (escape hatches)

Modern apps expose roles/labels; legacy ones often don't. For those, name an
explicit selector or an iframe and the engine targets it directly:

- **Raw selectors** — `click #submit`, `click .btn-primary`, `click [data-test="save"]`,
  `fill #email with jane@test.com`, `type hello into .search`,
  `click the element with xpath //table//a`
- **iframes** — `click Pay in the payment iframe`,
  `in the #checkout frame, fill Card Number with 4242`

These run at the highest priority, so a raw selector is never re-interpreted by
the semantic rules. (XPath still triggers a "prefer a role/label locator"
warning — it works, but it's brittle by nature.)

It also understands many **natural phrasings** beyond the literal forms above —
e.g. "Sign in with Google", "Register a new account", "Add the item to the cart",
"Proceed to checkout", "Accept cookies", "Open the user menu", "Sort by name",
"Switch on notifications", "Select all rows", "Delete the last row",
"Apply the discount code SAVE10", "Verify I'm on the checkout page",
"Verify there are no results", "The page should load". Coverage is exercised by
a corpus test that fails if mapping drops below 90%.

Anything the engine can't confidently map is emitted as a `// TODO` line plus a
warning, so the caller is told honestly rather than getting a wrong guess.

### Extending it

Add a new `StepRule` in `src/engine/rules/` and register it in `rules/index.ts`
at the appropriate priority. No other file needs to change.

## Generation guarantees

The validator (`src/services/validator.service.ts`) checks that generated code:

- imports `@playwright/test`,
- declares a `test()` block,
- contains at least one `expect()` assertion,
- never uses `page.waitForTimeout()`,
- avoids XPath selectors,
- has no unmapped (TODO) steps.

Any failed check is surfaced in `warnings` and `validation`.

## Roadmap

The engine is intentionally pluggable so a real AI provider could later be added
behind the same interface — for now, everything is deterministic and offline.
