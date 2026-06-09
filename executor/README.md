# Smart API Executor

A **Claude-free** Playwright runtime for Smart API. It turns plain-English steps
into real browser automation end-to-end:

```
English steps ──▶ Smart API engine ──▶ action-JSON ──▶ Executor (Playwright)
                  (deterministic translate)            finds elements, runs actions,
                                                        screenshots, reads page data
```

No AI at any stage. Where AtwalLabs uses Claude vision to recover a missed
locator, this uses a **deterministic self-healing cascade** instead: for each
target it tries the most likely locator strategies in order (role+name → exact
text → label → placeholder → partial text → attribute → case-insensitive regex)
and keeps the first that actually matches the live DOM.

## Use

```bash
npm install                       # installs playwright (reuses any cached browser)
node cli.js --url https://www.saucedemo.com \
  "Type standard_user in the Username field" \
  "Type secret_sauce in the Password field" \
  "Click Login" \
  "Verify the title contains Swag" \
  "Take a screenshot"

# or a step file, and --headed to watch:
node cli.js --url <url> --steps steps.json --headed
```

It prints a per-step report (`ok` / `healed` / `failed` / `skipped` / `unmapped`),
a tally, the **page data it read** (title, URL, element counts, headings, the
first table's rows), and writes screenshots.

## What it does natively (no Claude)

- **Find elements** — the self-healing locator cascade (`resolve.js`): role+name → exact text → label → placeholder → attribute → `/i` regex.
- **Scoped finding** — honors a target's `within` container (row / card / menu), so "Edit in the row for Jane Doe" acts inside *that* row, not the first match.
- **Selector-learning** — remembers which strategy won per host+target in `.smartx-cache.json` and tries it first next run, so repeat runs are instant and stable (deterministic, no AI).
- **Run actions** — click / fill / hover / press / wait / conditional click / asserts.
- **Extract data** — `read the cart total`, `extract the order number as orderId` → returns named values.
- **Capture screenshots** — real `page.screenshot()` per `screenshot` action + a final full-page shot.
- **Read page data** — title, URL, element inventory, headings, table extraction.
- **Robust actions** — auto scroll-into-view + one re-resolve/retry on transient re-renders.

## Honest limits (where a no-vision pipeline can miss)

- Row/region **scope is flattened** in the action-JSON, so "click Edit in the row
  for X" resolves to the first matching control, not the scoped one. (Executing
  the Playwright `code` output instead preserves the scope — a planned mode.)
- If **nothing** in the DOM matches by role/text/label/placeholder/attribute
  (canvas apps, obfuscated/generated markup with no accessible name), the cascade
  exhausts and reports `element not found` — there's no vision to recover it.
- Ambiguous matches resolve to `.first()`.

These are exactly the cases AtwalLabs' Claude-vision executor is built to recover;
this trades that recovery for determinism, speed, and zero cost.
