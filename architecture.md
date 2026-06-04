# Smart API — Architecture

> Smart API turns plain-English QA steps into clean, reliable Playwright TypeScript automation using a specialized rules engine.

This document describes how Smart API is structured, how a request flows through
the system, and the design principles that keep it extensible. It reflects the
current codebase (`smart-api-playwright-rules-v1`).

---

## 1. Overview

Smart API is a **stateless, deterministic** HTTP backend. It receives a test
name, a target URL, and a list of plain-English QA steps, and returns CI-ready
Playwright TypeScript code plus metadata (confidence, locator strategy,
assumptions, warnings, validation).

Key properties:

- **No external AI.** Translation is performed by an in-process rules engine.
- **No database.** Every request is pure: the same input always yields the same
  output.
- **No shared state.** Horizontally scalable; any instance can serve any request.
- **TypeScript-first.** Generated code uses `@playwright/test` and modern,
  web-first locators.

---

## 2. Technology stack

| Concern            | Choice                          |
| ------------------ | ------------------------------- |
| Runtime            | Node.js                         |
| Language           | TypeScript (strict)             |
| HTTP framework     | Express                         |
| Request validation | Zod                             |
| Code formatting    | Prettier (programmatic + CLI)   |
| Config             | dotenv + Zod-validated env      |
| CORS               | cors                            |
| Tests              | Vitest                          |

---

## 3. Layered architecture

Smart API is organized into clear layers with a one-directional dependency flow.
HTTP concerns never leak into the engine, and the engine never imports Express.

```
            HTTP edge
        ┌──────────────────────────────────────────────┐
        │  index.ts  →  app.ts                          │
        │      (entrypoint)   (Express app factory)     │
        └───────────────┬──────────────────────────────┘
                        │ mounts
        ┌───────────────▼──────────────────────────────┐
        │  middleware/        routes/                   │
        │  asyncHandler       health.routes             │
        │  errorHandler       playwright.routes ──┐     │
        └─────────────────────────────────────────┼─────┘
                                                  │ validate (Zod)
        ┌─────────────────────────────────────────▼─────┐
        │  schemas/generate.schema.ts                    │
        └─────────────────────────────────────────┬─────┘
                                                  │ typed input
        ┌─────────────────────────────────────────▼─────┐
        │  services/generator.service.ts  (orchestrator) │
        └───────┬───────────────┬───────────────┬───────┘
                │               │               │
        ┌───────▼──────┐ ┌──────▼───────┐ ┌─────▼────────────┐
        │ engine/      │ │ utils/       │ │ services/        │
        │ rulesEngine  │ │ formatCode   │ │ validator        │
        │ + rules/     │ │ literal,slug │ │ service          │
        │ + codeBuilder│ │              │ │                  │
        └──────────────┘ └──────────────┘ └──────────────────┘
```

### Layer responsibilities

| Layer            | Files                                     | Responsibility                                            |
| ---------------- | ----------------------------------------- | --------------------------------------------------------- |
| **Entrypoint**   | `index.ts`                                | Load validated env, build the app, bind the port.         |
| **App factory**  | `app.ts`                                  | Configure middleware, mount routes, return an `Application` (no port binding — testable). |
| **Config**       | `config/env.ts`                           | Parse & validate `process.env` with Zod; fail fast.       |
| **Constants**    | `constants.ts`                            | Product name, model name, tagline, API prefix.            |
| **Middleware**   | `middleware/asyncHandler.ts`, `errorHandler.ts` | Async error forwarding; 404 + 500 JSON envelopes.   |
| **Routes**       | `routes/health.routes.ts`, `playwright.routes.ts` | HTTP surface; parse request, call service, shape response. |
| **Schema**       | `schemas/generate.schema.ts`              | The request contract + inferred `GenerateInput` type.     |
| **Service**      | `services/generator.service.ts`, `validator.service.ts` | Orchestrate the pipeline; statically validate output. |
| **Engine**       | `engine/*`                                | Deterministic translation of steps → Playwright code.     |
| **Utils**        | `utils/formatCode.ts`, `literal.ts`, `slug.ts` | Pure helpers (formatting, safe string literals, slugs).  |

---

## 4. Directory map

```
src/
  index.ts                     # Entrypoint — binds the port
  app.ts                       # Express app factory (no listen)
  constants.ts                 # PRODUCT_NAME, MODEL_NAME, TAGLINE, API_PREFIX
  config/
    env.ts                     # Zod-validated environment config
  middleware/
    asyncHandler.ts            # Wraps async handlers → forwards rejections
    errorHandler.ts            # notFoundHandler (404) + errorHandler (500)
  routes/
    health.routes.ts           # GET /health
    playwright.routes.ts       # POST /api/v1/playwright/generate
  schemas/
    generate.schema.ts         # Zod request contract → GenerateInput
  engine/                      # ── The deterministic rules engine ──
    types.ts                   # StepRule, RuleOutput, EngineResult, LocatorStrategy
    rulesEngine.ts             # Runs steps through the registry, aggregates results
    codeBuilder.ts             # Assembles the final test file from emitted lines
    rules/
      index.ts                 # Ordered rule registry (priority matters)
      navigation.ts            # navigate
      assertions.ts            # assert-url, assert-title, assert-visible,
                               #   assert-contains-text, wait-for
      forms.ts                 # fill, check, uncheck, select-option
      interaction.ts           # press-key, hover, close-overlay, click
  services/
    generator.service.ts       # Pipeline: engine → build → format → validate
    validator.service.ts       # Static quality checks on generated code
  utils/
    formatCode.ts              # Prettier (async, Prettier 3)
    literal.ts                 # Safe single-quoted TS string literals
    slug.ts                    # Screenshot filename slugs

tests/                         # Vitest suite (excluded from the build)
  utils.test.ts  rules.test.ts  rulesEngine.test.ts
  validator.test.ts  generator.test.ts  schema.test.ts
```

---

## 5. Request lifecycle

`POST /api/v1/playwright/generate`

```
1. Express receives JSON  ─────────────────────────────────────────────┐
                                                                        │
2. generateSchema.safeParse(req.body)                                   │
     ├─ invalid → 400 { success:false, error:"ValidationError",         │
     │                   issues:[{path,message}] }                      │
     └─ valid   → typed GenerateInput                                   │
                                                                        ▼
3. generator.service.generate(input)
     a. runRulesEngine(steps, { closeOverlaysWithEscape })
          for each step → first matching rule in RULES
            ├─ match   → emit Playwright line(s), strategy, assumptions, confidence
            └─ no match→ emit "// TODO …", record unmatched + warning
          aggregate → bodyLines, strategies, assumptions, confidence, warnings
     b. buildTestFile({ testName, url, bodyLines, includeScreenshots })
          → import + test() wrapper + goto(url) + body + optional screenshot
     c. formatCode(raw)            → Prettier (single quotes, no semicolons)
     d. validateGeneratedCode(code)→ static checks → { valid, warnings }
     e. assemble GenerateResult (+ JS-fallback warning if language='javascript')
                                                                        │
4. Route shapes the HTTP response                                       ▼
     200 { success:true, model, tagline, language, code,
           locatorStrategy, confidenceScore, assumptions,
           warnings, validation, meta }
```

Any thrown error is caught by `asyncHandler` and rendered by `errorHandler`
as a consistent `500 { success:false, error, message }` envelope. Unknown
routes hit `notFoundHandler` → `404`.

---

## 6. The rules engine (core)

The engine is the heart of Smart API and is deliberately decoupled from HTTP.

### 6.1 The `StepRule` contract

```ts
interface StepRule {
  name: string                                   // stable id, surfaced in meta
  description: string                            // phrasings it handles
  apply(step: string, ctx: StepContext): RuleOutput | null
}

interface RuleOutput {
  lines: string[]                                // Playwright statement(s)
  strategies: LocatorStrategy[]                  // role | label | text | ...
  assumptions: string[]                          // reviewer caveats
  confidence: number                             // 0..1
}
```

### 6.2 Ordered registry (`rules/index.ts`)

Steps are matched against an **ordered list**; the first rule that returns a
non-null `RuleOutput` wins. Order encodes priority so specific rules beat the
generic `click` fallback:

```
navigate → press-key → assert-url → assert-title → assert-visible →
assert-contains-text → wait-for → fill → select-option → check →
uncheck → hover → close-overlay → click
```

Why the order matters (examples):

- `press-key` before `click` so **"Press Enter"** is a key press, while
  **"Press Submit"** (not a known key) falls through to a button click.
- assertions before `click`/`check` so **"Verify X appears"** is not mis-read as
  an action.

### 6.3 Aggregation (`rulesEngine.ts`)

Per-step outputs are combined into an `EngineResult`:

- **bodyLines** — concatenated Playwright statements.
- **confidence** — mean of per-step confidences, rounded to 2 decimals
  (unmatched steps contribute `0.1`).
- **strategies** — distinct strategies, emitted in a canonical order to form
  the `locatorStrategy` label (e.g. `role-label-text`).
- **assumptions** — de-duplicated set.
- **warnings / unmatchedSteps** — one warning per step that no rule could map.
- **analyzed** — per-step `{ step, rule, confidence }` for response `meta`.

### 6.4 Design guarantees baked into rules

- **Never `page.waitForTimeout()`** — `wait for X` is translated into a
  web-first assertion (`expect(locator).toBeVisible()`).
- **Prefer accessible locators** — `getByRole`, `getByLabel`, `getByText`,
  `selectOption`; XPath/brittle CSS are never generated.
- **Honor user intent flags** — `closeOverlaysWithEscape` switches overlay
  dismissal between the Escape key and a Close button.
- **Safe literals** — all interpolated values pass through `lit()` so quotes and
  backslashes can never break generated code.

---

## 7. Code assembly & validation

- **`codeBuilder.ts`** assembles a complete file: the `@playwright/test` import,
  the `test(name, async ({ page }) => { … })` wrapper, the initial
  `page.goto(url)`, the engine's body lines, and an optional end-of-test
  `page.screenshot(...)`.
- **`formatCode.ts`** runs Prettier 3 (async) with the repo style (single
  quotes, no semicolons, width 100). On failure it returns the input unchanged
  so cosmetics never fail a request.
- **`validator.service.ts`** applies a list of independent checks; each failed
  check adds a warning. Current checks: imports `@playwright/test`, has a
  `test()`, has an `expect()`, no `waitForTimeout()`, no XPath (comment-safe
  regex), and no leftover `TODO` steps. `valid` is `true` only when zero
  warnings fire.

---

## 8. Configuration & runtime

- **`config/env.ts`** validates `PORT` (default `4000`) and `NODE_ENV`
  (`development` | `test` | `production`) with Zod and **exits the process** on
  invalid config — failures surface at boot, not mid-request.
- **`app.ts`** enables CORS, a `256kb` JSON body limit, a root `GET /` service
  descriptor, the health and generate routers, then the 404 and error handlers
  (registered last, as Express requires).

---

## 9. Testing strategy

The engine's purity makes it ideal for fast unit tests. The Vitest suite
(`tests/`, excluded from the production build) covers:

- **Utilities** — `lit` escaping, `slugify`.
- **Rules** — each rule's output and the ordering edge cases.
- **Engine** — confidence averaging/rounding, strategy ordering, assumption
  dedup, unmatched handling.
- **Validator** — every check, including the regression that a `//` code comment
  is not mistaken for XPath.
- **Pipeline** — formatting, screenshots, the Escape flag, JS→TS fallback, and
  **determinism** (identical input → identical output).
- **Schema** — valid payloads, defaults, and each rejection case.

Run with `npm test` (or `npm run test:watch`).

---

## 10. Extensibility

The system is designed so the most common change — teaching Smart API a new
phrasing — touches the fewest files.

**Add a new behavior:**

1. Write a `StepRule` in the appropriate `engine/rules/*.ts` file (or a new file).
2. Register it in `engine/rules/index.ts` at the correct priority.
3. Add a test in `tests/rules.test.ts`.

No routes, schemas, services, or the engine core need to change.

**Other extension points:**

- **Tighten quality** — add a check to `validator.service.ts`.
- **New endpoints** — add a router under `routes/` and mount it in `app.ts`.
- **Swap the brain** — because the engine sits behind
  `generator.service.generate()`, a future AI provider could be introduced
  behind the same interface without changing the HTTP layer. Today everything is
  deterministic and offline.

---

## 11. Design principles (summary)

1. **Determinism over cleverness** — reproducible output is a feature.
2. **One-directional dependencies** — HTTP → service → engine → utils; never back.
3. **Pure core, thin edges** — business logic in pure modules, side effects at
   the boundary (`index.ts`, Express).
4. **Fail fast, fail clearly** — Zod at config and request boundaries; consistent
   JSON error envelopes.
5. **Extensible by addition** — new rules slot into an ordered registry; nothing
   else changes.
6. **Quality is enforced, not assumed** — generated code is validated and the
   engine itself is unit-tested.
