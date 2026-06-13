# Smart API — Architecture

> Smart API turns plain-English QA steps into reliable browser automation —
> emitting either clean Playwright TypeScript **or** a structured **action-JSON**
> that its companion **Executor** can run directly, with **no AI at runtime**.

This document describes how Smart API is structured, how a request flows through
the system, and the design principles that keep it extensible. It reflects the
current codebase (`smart-api-playwright-rules-v1`).

---

## 1. Overview

Smart API is a **deterministic, AI-free** automation brain. It has three parts:

1. **Translator (HTTP service)** — receives a test name, target URL, and
   plain-English steps; returns either CI-ready Playwright TypeScript **code** or
   a structured **action-JSON** (`outputFormat: "playwright" | "actions"`), plus
   metadata (confidence, locator strategy, assumptions, warnings, validation).
2. **Knowledge Base (per-org)** — an embedded SQLite store that lets the engine
   *learn each organization's locators* over time (`teach`/`learn`), so the same
   phrasing resolves better for that org on the next run.
3. **Executor (companion package)** — a standalone Playwright runner that consumes
   action-JSON and *executes it against a live browser with no Claude*: a
   self-healing locator cascade, **deterministic DOM-scoring "vision"**, and
   selector-learning. This is what turns Smart API from a translator into a
   complete Claude-free automation engine.

Key properties:

- **No external AI, ever.** Translation is an in-process rules engine; element
  location is deterministic DOM scoring. There is no LLM in any runtime path.
- **Deterministic core.** The same steps always translate to the same output.
- **Embedded persistence, not a service dependency.** The KB and usage log live
  in a local SQLite file (`better-sqlite3`) — no external database to operate.
- **Two consumption modes.** Emit TypeScript for humans/CI, or action-JSON for
  any runner (the Executor, AtwalLabs, Sachaflow, custom CI).

> **Relationship to AtwalLabs.** Smart API is the deterministic brain. Its
> DOM-scoring locator logic (`executor/domResolve.js`) was ported into AtwalLabs'
> `visionLocator` so AtwalLabs can run **Claude-free** — native rule translation
> + deterministic vision instead of an LLM. See `executor/README.md`.

---

## 2. Technology stack

| Concern            | Choice                                   |
| ------------------ | ---------------------------------------- |
| Runtime            | Node.js                                  |
| Language           | TypeScript (strict) — service; JS — Executor |
| HTTP framework     | Express                                  |
| Request validation | Zod                                      |
| Persistence        | better-sqlite3 (KB + usage), embedded    |
| Browser automation | Playwright (Executor only)               |
| Code formatting    | Prettier (programmatic + CLI)            |
| Auth               | API-key middleware (optional, env-gated) |
| API docs           | OpenAPI 3 + Redoc (`/docs`)              |
| Config             | dotenv + Zod-validated env               |
| Tests              | Vitest                                   |

---

## 3. The two halves

```
  ┌──────────────────────────── Smart API service (src/) ────────────────────────────┐
  │                                                                                   │
  │   English steps ──► Rules engine ──► { Playwright code  |  action-JSON }          │
  │                         ▲                                                         │
  │                         │ per-org locator hints                                   │
  │                    Knowledge Base (SQLite)  ◄── teach / learn                     │
  │                                                                                   │
  │   every request ──► usage logger (SQLite: requests + unmapped steps)              │
  └───────────────────────────────────────────┬───────────────────────────────────────┘
                                              │ action-JSON (outputFormat:"actions")
                                              ▼
  ┌──────────────────────────── Executor (executor/) ────────────────────────────────┐
  │   action-JSON ──► resolve cascade ──► [miss] ──► domResolve (DOM-scoring vision)   │
  │                         │                                                         │
  │                    selector-learning cache  (.smartx-cache.json)                  │
  │                         ▼                                                         │
  │                    Playwright actions on a live page  (fill/click/extract/…)      │
  └───────────────────────────────────────────────────────────────────────────────────┘
```

The service never touches a browser; the Executor never imports Express. They
communicate only through the action-JSON contract (`executor/client.js` is a thin
HTTP client that calls the service and returns actions).

---

## 4. Layered architecture (service)

One-directional dependency flow. HTTP concerns never leak into the engine, and
the engine never imports Express.

```
            HTTP edge
        ┌──────────────────────────────────────────────┐
        │  index.ts  →  app.ts                          │
        └───────────────┬──────────────────────────────┘
                        │ middleware: cors, json, usageLogger, requireApiKey
        ┌───────────────▼──────────────────────────────┐
        │  routes/  health · docs · playwright · kb · usage │
        └───────────────┬──────────────────────────────┘
                        │ validate (Zod): generate / teach / learn
        ┌───────────────▼──────────────────────────────┐
        │  services/generator.service.ts (orchestrator) │
        └───┬───────────┬───────────┬───────────┬───────┘
            │           │           │           │
   ┌────────▼───┐ ┌─────▼─────┐ ┌───▼────┐ ┌────▼───────┐
   │ engine/    │ │ kb/       │ │ usage/ │ │ services/  │
   │ rules +    │ │ per-org   │ │ logger │ │ validator  │
   │ actions +  │ │ SQLite    │ │ +scan  │ │            │
   │ codeBuilder│ │ learning  │ │        │ │            │
   └────────────┘ └───────────┘ └────────┘ └────────────┘
```

### Layer responsibilities

| Layer            | Files                                              | Responsibility |
| ---------------- | -------------------------------------------------- | -------------- |
| **Entrypoint**   | `index.ts`                                         | Load env, build app, bind port. |
| **App factory**  | `app.ts`                                           | Middleware, route mounting, service descriptor (no listen). |
| **Middleware**   | `middleware/apiKey.ts`, `usageLogger.ts`, `asyncHandler.ts`, `errorHandler.ts` | Optional API-key auth; per-request usage logging; async error forwarding; JSON error envelopes. |
| **Routes**       | `routes/health` · `docs` · `playwright` · `kb` · `usage` | HTTP surface (see §5). |
| **Schemas**      | `schemas/generate` · `teach` · `learn`             | Zod request contracts. |
| **Service**      | `services/generator.service.ts`, `validator.service.ts` | Orchestrate the pipeline; statically validate emitted code. |
| **Engine**       | `engine/*`                                         | Deterministic translation → Playwright code **and** action-JSON. |
| **Knowledge Base** | `kb/db.ts`, `kb.service.ts`, `locator.ts`        | Per-org learned locators (SQLite); phrase normalization; locator building. |
| **Usage**        | `usage/usage.service.ts`                           | Request stats, per-org/day rollups, unmapped-step capture. |
| **Docs**         | `openapi.ts`, `routes/docs.routes.ts`              | OpenAPI 3 spec + Redoc UI. |
| **Utils**        | `utils/formatCode.ts`, `literal.ts`, `slug.ts`     | Pure helpers. |

---

## 5. HTTP surface

| Method & path                         | Auth | Purpose |
| ------------------------------------- | ---- | ------- |
| `GET /health`                         | no   | Liveness. |
| `GET /docs`, `GET /openapi.json`      | no   | Redoc UI + OpenAPI spec (discovery). |
| `POST /api/v1/playwright/generate`    | key  | Translate steps → code **or** action-JSON. |
| `POST /api/v1/kb/:org/teach`          | key  | Teach an org a phrase→locator mapping. |
| `POST /api/v1/kb/:org/learn`          | key  | Record a confirmed-working locator for an org. |
| `GET  /api/v1/kb/:org`                | key  | Inspect an org's learned locators. |
| `DELETE /api/v1/kb/:org`              | key  | Reset an org's KB. |
| `GET  /api/v1/usage`                  | key  | Usage summary (calls, avg confidence, per-org/day, recent). |
| `GET  /api/v1/usage/unmapped`         | key  | Phrasings the engine could not map (the build-out backlog). |

API-key auth (`middleware/apiKey.ts`) is enabled when a key is configured; docs
and health stay public for discovery.

---

## 6. Request lifecycle — `POST /api/v1/playwright/generate`

```
1. Zod: generateSchema.safeParse(req.body)
     invalid → 400 { success:false, error:"ValidationError", issues:[…] }
     valid   → GenerateInput { testName, url, steps[], outputFormat,
                               language, includeScreenshots, closeOverlaysWithEscape }
     (org scope comes from the `X-Org-Id` header, not the body)

2. generator.service.generate(input)
     a. runRulesEngine(steps, ctx)         // ctx carries the org's KB resolver
                                           //   when X-Org-Id is present
          per step → first matching rule wins → bodyLines + strategy +
                     assumptions + confidence   (no match → note + warning)
     b. outputFormat === "actions"?
          → toActions(bodyLines)            // engine/actions.ts: code → action-JSON
          → return { actions, … }
        else
          → buildTestFile(...) → formatCode (Prettier) → validateGeneratedCode
     c. record weak/unmapped steps to the usage log (diagnostics)

3. Route shapes the response
     "playwright": 200 { success, code, locatorStrategy, confidenceScore,
                          assumptions, warnings, validation, meta }
     "actions":    200 { success, actions, confidenceScore, assumptions,
                          warnings, meta }
```

`usageLogger` records method/path/org/status/latency for every request (except
`/health`). Thrown errors → `asyncHandler` → `errorHandler` → `500` envelope;
unknown routes → `404`.

---

## 7. The rules engine (core)

Deliberately decoupled from HTTP. ~100 ordered rules across focused files.

### 7.1 The `StepRule` contract

```ts
interface StepRule {
  name: string
  description: string
  apply(step: string, ctx: StepContext): RuleOutput | null
}
interface RuleOutput {
  lines: string[]                 // Playwright statement(s)
  strategies: LocatorStrategy[]   // role | label | text | css | xpath | id …
  assumptions: string[]
  confidence: number              // 0..1
}
```

### 7.2 Ordered registry (`rules/index.ts`)

First non-null match wins; order encodes priority (specific before the generic
`click` fallback). Rules are grouped by concern:

| File                | Handles |
| ------------------- | ------- |
| `navigation.ts`     | goto / navigate (URL encoding, "in a new tab", host:port). |
| `authentication.ts` | login / sign-in / credentials / OTP phrasings. |
| `assertions.ts`     | assert URL/title/visible/contains-text, **count** ("the cart has 3 items"), disabled/selected, redirect, page-loaded. |
| `forms.ts`          | fill / check / uncheck / select (incl. "set X dropdown to V", "clear X and type Y"). |
| `selectors.ts`      | role/label/text/css/xpath/id targeting + scoping (`within`, `nth`). |
| `tables.ts`         | row/cell scoping, column headers, "in the row for X, click Y". |
| `interaction.ts`    | press-key, hover, close-overlay, click, tabs, sliders, toggles. |
| `natural.ts`        | freer phrasings: extract/read-as, conditional ("if the popup appears, close it"), e-commerce, explicit waits (`waitForTimeout` only for "wait N seconds"). |

Shared helpers live in `engine/text.ts` (quote extraction, filler stripping,
label cleaning, icon affordances, assertion detection). `engine/explain.ts`
produces human-readable rationale for the chosen mapping.

### 7.3 Aggregation (`rulesEngine.ts`)

Per-step outputs combine into an `EngineResult`: `bodyLines`, mean `confidence`
(unmatched = 0.1), distinct ordered `strategies`, deduped `assumptions`,
`warnings`/`unmatchedSteps`, and `analyzed` (`{step,rule,confidence}` for `meta`).
`normalizeStep` + `expandStep` split connectors ("enter X and click Y") and guard
conditionals before matching.

### 7.4 Guarantees baked into rules

- **Web-first locators** — `getByRole`/`getByLabel`/`getByText`; brittle CSS/XPath
  only when the step explicitly provides one.
- **`waitForTimeout` only when asked** — "wait N seconds" emits an explicit pause;
  "wait for X" becomes a visibility assertion.
- **No duplicate `goto`** to the same URL; safe single-quoted literals via `lit()`.

---

## 8. Action-JSON model (`engine/actions.ts`)

For `outputFormat: "actions"`, the engine maps generated Playwright lines into a
runner-agnostic contract:

```ts
interface Target { by: 'text'|'css'|'xpath'|'label'|'id'|'role'; value: string
                   role?: string; within?: Scope; nth?: number }

type Action =
  | { type:'goto'; url }            | { type:'fill'; target; value }
  | { type:'click'; target }        | { type:'hover'; target }
  | { type:'wait'; ms }             | { type:'press'; key }
  | { type:'screenshot'; name? }    | { type:'assertTitle'; contains }
  | { type:'assertUrl'; contains }  | { type:'assertVisible'; target }
  | { type:'extract'; target; prop:'text'|'value'; as? }
  | { type:'conditionalclick'; guard; click }
  | { type:'note'; text }
```

`parseTarget` is regex-literal-aware and extracts `within`/`nth` scoping. This is
the contract the Executor (and external runners) consume.

---

## 9. Knowledge Base (`kb/`)

Per-org learning so Smart API improves for each customer over time.

- **`db.ts`** — embedded SQLite (`better-sqlite3`), three tables: `kb_entries`
  (org, phrase, norm, locator, strategy, page, `provenance` = taught|learned,
  `hits`), `usage_log` (per-request stats), and `unmapped_log` (org, step, rule,
  confidence — the phrasings to build rules for).
- **`kb.service.ts`** — phrase `normalize()` (lowercase, strip punctuation &
  true stopwords — keeps meaningful words like "in"/"on"), match learned mappings,
  and emit a `RuleOutput` when an org-specific locator is known.
- **`locator.ts`** — build a Playwright locator from a stored `LocatorSpec`.
- **`teach`** registers a phrase→locator mapping; **`learn`** records a
  confirmed-working locator from a real run. The engine consults the org KB
  during translation, so phrasings that once fell through get resolved next time.

The KB is the mechanism behind "Smart API learns each org's locators" — AtwalLabs
is the first org.

---

## 10. The Executor (`executor/`) — Claude-free execution

A standalone Playwright package that *runs* action-JSON. No Express, no LLM.

| File           | Responsibility |
| -------------- | -------------- |
| `client.js`    | Thin HTTP client: `translate(steps,{apiKey,org,url})` → action-JSON. Lets any runner use Smart API without bundling the engine. |
| `index.js`     | `execute(steps, opts)` — translate (or accept actions), then drive a Playwright page: `runAction` (click/fill/hover with scroll+retry; `extract` reads named values; `conditionalclick`), `readPage`, `resolveLearned`. |
| `resolve.js`   | **Self-healing locator cascade.** For a `Target`, build ordered candidate locators (role-aware, by `by`), resolve `within` scope first, promote the previously-winning strategy (selector learning). Falls through to `domResolve` when the cascade misses. |
| `domResolve.js`| **Deterministic "vision."** `BROWSER_SCORE` runs in `page.evaluate`: snapshots every interactive element with its implicit role, accessible name (aria/label/placeholder/title/text), and nearby-cell label (table forms), then *scores* each against the target intent and marks the best match. Reasons over the DOM the way Claude vision reasons over a screenshot — minus the LLM. |
| `cache.js`     | Selector-learning cache (`.smartx-cache.json`) — remembers which strategy resolved a target per host, promoted on the next run. |
| `cli.js`       | CLI runner with a result report. |

`domResolve` is the long-tail catch the simple cascade can't reach (e.g. inputs
with no `<label>`, only a sibling table-cell label). Its scoring logic is the
same one ported into AtwalLabs' `visionLocator` for Claude-free element location.

---

## 11. Code assembly & validation (service)

- **`codeBuilder.ts`** — assembles the file: `@playwright/test` import, the
  `test(name, async ({ page }) => { … })` wrapper, initial `page.goto(url)`,
  engine body lines, optional end screenshot. Dedupes a redundant `goto`.
- **`formatCode.ts`** — Prettier 3 (single quotes, no semicolons, width 100);
  on failure returns input unchanged so cosmetics never fail a request.
- **`validator.service.ts`** — independent checks (imports `@playwright/test`,
  has `test()`/`expect()`, no `waitForTimeout` unless intended, no stray XPath,
  no leftover TODO). `valid` is true only when zero warnings fire.

---

## 12. Configuration & runtime

- **`config/env.ts`** — Zod-validates `PORT`, `NODE_ENV`, optional API key, KB
  path; **exits on invalid config** (fail at boot, not mid-request).
- **`app.ts`** — CORS, `256kb` JSON limit, usage logger, a root service
  descriptor, then health/docs (public) and key-guarded playwright/kb/usage
  routers, then 404 + error handlers (last, as Express requires).

---

## 13. Testing strategy

Vitest (`tests/`, excluded from build). Engine purity makes tests fast:

- **Utilities** — `lit` escaping, `slugify`.
- **Rules** — each rule's output and ordering edge cases (`quality-gaps.test.ts`
  pins real bugs: quote stripping, article stripping, count assertions,
  multi-action splitting, conditional guards, honest non-mapping).
- **Engine** — confidence averaging, strategy ordering, assumption dedup.
- **Validator** — every check (incl. the `//`-is-not-XPath regression).
- **Pipeline** — formatting, screenshots, action-JSON output, determinism.
- **Schema** — valid payloads, defaults, rejections.

---

## 14. Extensibility

The most common change — teaching a new phrasing — touches the fewest files:

1. Write a `StepRule` in the right `engine/rules/*.ts`.
2. Register it in `rules/index.ts` at the correct priority.
3. Add a test in `tests/`.

Other extension points: a new `validator` check; a new router mounted in `app.ts`;
a new locator strategy in `domResolve`/`resolve` (helps every runner at once);
teach the KB instead of writing a rule when a mapping is org-specific.

---

## 15. Design principles (summary)

1. **No AI at runtime** — rules for translation, DOM scoring for location.
   Reproducible, auditable, free.
2. **Determinism over cleverness** — identical input → identical output.
3. **One-directional dependencies** — HTTP → service → engine → utils; the
   Executor depends on the action-JSON contract, nothing more.
4. **Learn per org** — the KB makes the tool better for each customer over time
   without changing code.
5. **Extensible by addition** — rules slot into an ordered registry; vision gains
   slot into one scorer that every consumer inherits.
6. **Quality is enforced, not assumed** — emitted code is validated; the engine
   and scorer are unit-tested and swept against real DOM patterns.
