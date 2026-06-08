# Smart API — Executive Summary & Audit

*Plain-English QA test cases → clean, runnable Playwright automation. Deterministic. No AI cost.*

**Status:** Live in production · `https://smartapi.atwallabs.com` · audited {2026-06-08}

---

## 1. What it is (in one line)

Smart API turns a tester's plain-English steps (e.g. *"Login with Email as user@test.com, click Add Contact, verify Jane Doe appears"*) into **ready-to-run Playwright TypeScript** — instantly, deterministically, and at **zero per-request cost**, because it uses a specialized rules engine instead of an external AI model.

---

## 2. Audit scorecard

| Dimension | Result |
|---|---|
| **Availability** | Live, HTTPS, API-key secured (AWS) |
| **Performance** | **~0.24s** median response (warm); ~0.55s cold start |
| **Per-request cost** | **$0** (no AI tokens) · hosting ~$5–10/mo |
| **Determinism** | Same input → same output, every time (no AI variability) |
| **Quality gates** | **206 automated tests** passing; generated code auto-validated |
| **Plain-English coverage** | **~81%** of a realistic QA-phrasing corpus mapped with no hints |
| **Total reachability** | **~100%** — any element targetable via selectors/KB |
| **Codebase** | ~3,600 lines, 85+ rules, 10 locator strategies, clean architecture |

---

## 3. What the API can do (capabilities)

### Core
- **Generates production-grade Playwright TypeScript** from plain-English steps — uses modern, accessible locators (`getByRole`, `getByLabel`, `getByText`), never brittle waits or XPath by default.
- **Quality-guaranteed output:** every script is validated to import `@playwright/test`, contain real assertions, and **never** use hard waits (`waitForTimeout`). Honest by design — it flags steps it can't map rather than guessing.
- **Confidence scoring & assumptions:** each result reports a confidence score and the assumptions a reviewer should check.

### Breadth (≈85 rules across the web vocabulary)
- **Navigation, clicks** (button/link/tab/text/test-id/nth/image), **forms** (fill, select, checkbox, radio, file upload, slider), **assertions** (visible/hidden, enabled/disabled, value, count, URL, title), **gestures** (drag-drop, hover, scroll, keyboard combos), **dialogs, screenshots, search, e-commerce flows**, and **authentication** (login/logout, adapts to the app's wording).
- **Natural phrasing:** understands how testers actually write — *"Add the item to the cart," "Sign in with Google," "Accept cookies," "Verify I'm on the checkout page."*

### Legacy & modern apps
- **Modern apps:** infers clean accessible locators automatically.
- **Legacy/inaccessible apps:** escape hatches let testers name raw **CSS / XPath / #id** selectors and act inside **iframes** — so *any* element is reachable.

### Self-learning (the differentiator)
- **Per-organization Knowledge Base:** the API can **learn a specific app's real elements** and then generate locators proven against *that* app, not generic guesses.
- **Three ways to teach it:** manual mapping (`teach`), automatic page **harvesting**, or an interactive **recorder** (a QA explores the app and clicks elements to capture them).
- Matching is deterministic — **still no AI** — so it stays fast, free, and auditable.

---

## 4. Strategic value

- **Replaces paid AI calls** for the test-generation use case → recurring **token cost eliminated**, no third-party rate limits or outages.
- **Deterministic & auditable** → reproducible results, no hallucinations, enterprise-friendly.
- **Self-owned & standalone** → no vendor lock-in; can serve multiple internal products or external customers.
- **Gets smarter per customer** → the per-org KB is a compounding moat an off-the-shelf model can't match.

---

## 5. Honest limitations (today)

- **Generates code; humans review and run it.** It is a test-authoring accelerator, not an autonomous QA bot.
- **Infers locators from words, not the live page** (unless the app has been taught/harvested). The roadmap closes this with a verifier.
- **Single instance / single region** — right-sized for internal/early use; not yet HA for SLA-backed external traffic.
- **Out of scope:** shadow DOM, `<canvas>`, multi-tab orchestration; TypeScript output only (no JS yet).

---

## 6. Future enhancements (roadmap)

**Near term — make it bulletproof**
- **Dry-run verifier (flagship):** run the generated script against the real page, report which locators don't resolve, and **self-heal** the KB. Turns "good guess" into "verified against your app."
- **Operational hardening:** rate limiting, request logging, KB backups, CI gate, automated deploys.
- **KB backups & multi-key access** for safe team/customer use.

**Medium term — broaden reach**
- **Crawl mode** to learn an entire app's public pages in one pass.
- **Page-scoped intelligence** (right element when a word means different things on different pages).
- **JavaScript output** and grouped/structured test files (`describe`, shared setup).

**Longer term — scale & product**
- **High availability** (multi-instance, managed DB) for external/SLA use.
- **More element classes:** shadow DOM, drag-with-coordinates, multi-tab.
- **Self-service portal:** per-customer keys, usage dashboards, the recorder as a hosted tool.

---

## 7. Bottom line

Smart API already delivers **fast, free, deterministic** plain-English → Playwright generation, broad enough for real-world QA and **uniquely able to learn each customer's app**. The single highest-leverage next investment is the **dry-run verifier + self-healing**, which would make every generated test *verified against the live application* — a capability no general-purpose AI offers out of the box.
