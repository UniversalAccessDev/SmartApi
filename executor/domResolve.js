'use strict'

/**
 * Deterministic "vision" — Claude-free element location by DOM scoring.
 *
 * Where AtwalLabs sends a screenshot + DOM snapshot to Claude to PICK the element,
 * this builds the same structured snapshot of every interactive/visible element
 * and scores each against the target intent ({by, value, role}) with a ranking
 * function — then acts on the best match. No LLM, no pixels: it reasons over the
 * accessible names, roles, labels, placeholders and proximity that the DOM
 * already exposes. Handles the long tail the simple locator cascade misses.
 */

// The whole scorer runs in the browser (page.evaluate). It returns the index of
// the best element, which we then mark + drive from Node.
/* eslint-disable */
function BROWSER_SCORE(t) {
  const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const target = norm(t.value);
  const tTokens = target.split(' ').filter(Boolean);

  const implicitRole = (el) => {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (el.getAttribute('role')) return el.getAttribute('role');
    if (tag === 'a' && el.hasAttribute('href')) return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'summary') return 'button';
    if (tag === 'input') {
      if (['submit', 'button', 'reset', 'image'].includes(type)) return 'button';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (['text', 'email', 'password', 'search', 'tel', 'url', 'number', ''].includes(type)) return 'textbox';
    }
    return '';
  };

  const accName = (el) => {
    const al = el.getAttribute('aria-label');
    if (al) return al;
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const t = lb.split(/\s+/).map((id) => { const e = document.getElementById(id); return e ? e.textContent : ''; }).join(' ');
      if (t.trim()) return t;
    }
    // associated <label for=id> or wrapping <label>
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l && l.textContent.trim()) return l.textContent; }
    let p = el.closest('label'); if (p && p.textContent.trim()) return p.textContent;
    if (el.placeholder) return el.placeholder;
    if (el.getAttribute('title')) return el.getAttribute('title');
    if (el.alt) return el.alt;
    if (el.value && ['submit', 'button', 'reset'].includes((el.getAttribute('type') || '').toLowerCase())) return el.value;
    const txt = (el.textContent || '').trim();
    if (txt && txt.length <= 80) return txt;
    return '';
  };

  // Nearby label text for inputs without an explicit label (table/grid forms).
  const nearbyLabel = (el) => {
    const tag = el.tagName.toLowerCase();
    if (!['input', 'select', 'textarea'].includes(tag)) return '';
    // preceding cell / sibling text
    const cell = el.closest('td, th, .field, .form-group, li, p, div');
    if (cell) {
      const prev = cell.previousElementSibling;
      if (prev && prev.textContent && prev.textContent.trim().length <= 50) return prev.textContent;
    }
    const prevEl = el.previousElementSibling;
    if (prevEl && prevEl.textContent && prevEl.textContent.trim().length <= 50) return prevEl.textContent;
    return '';
  };

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const st = getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
  };

  const nameScore = (name) => {
    name = norm(name);
    if (!name || !target) return 0;
    if (name === target) return 100;
    if (name.startsWith(target) || target.startsWith(name)) return 78;
    if (name.includes(target) || target.includes(name)) return 60;
    const nTokens = name.split(' ').filter(Boolean);
    const overlap = tTokens.filter((tok) => nTokens.includes(tok)).length;
    if (overlap) return 30 + (overlap / Math.max(tTokens.length, 1)) * 30;
    return 0;
  };

  const wantFill = t.by === 'label' || t.intent === 'fill';
  const wantRole = t.role || (t.by === 'text' ? null : null);

  const els = Array.from(document.querySelectorAll(
    'a[href],button,input:not([type=hidden]),select,textarea,summary,label,[role],[onclick],[tabindex],[contenteditable=""],[contenteditable=true]'
  ));

  let best = -1, bestScore = 0, bestInfo = null, idx = -1;
  const seen = new Set();
  for (const el of els) {
    idx++;
    if (seen.has(el)) continue; seen.add(el);
    if (!visible(el)) continue;
    const role = implicitRole(el);
    const name = accName(el);
    let score = nameScore(name);
    // nearby-label boost for form fields
    if (wantFill && score < 60) {
      const nb = nameScore(nearbyLabel(el));
      if (nb > score) score = nb * 0.9;
    }
    if (score === 0) continue;

    // role alignment
    if (t.role && role === t.role) score += 35;
    else if (t.role && role && role !== t.role) score -= 10;
    // fill intent should prefer inputs; click should prefer interactive controls
    const isInput = ['input', 'select', 'textarea'].includes(el.tagName.toLowerCase()) || el.isContentEditable;
    if (wantFill && isInput) score += 25;
    if (wantFill && !isInput) score -= 20;
    if (!wantFill && (role === 'button' || role === 'link')) score += 8;
    // disabled penalty
    if (el.disabled) score -= 30;

    if (score > bestScore) { bestScore = score; best = idx; bestInfo = { name: norm(name), role, tag: el.tagName.toLowerCase(), score: Math.round(score) }; }
  }

  if (best >= 0 && bestScore >= 45) {
    // mark the winner so Node can drive it
    let i = -1;
    for (const el of els) { i++; if (i === best) { el.setAttribute('data-smartx-pick', '1'); break; } }
    return { ok: true, info: bestInfo };
  }
  return { ok: false };
}
/* eslint-enable */

/**
 * Resolve a target by scoring the live DOM. Returns { locator, how, healed }
 * or null. The chosen element is tagged data-smartx-pick (cleared after use).
 */
async function domResolve(page, target, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await page.evaluate(() => {
      document.querySelectorAll('[data-smartx-pick]').forEach((e) => e.removeAttribute('data-smartx-pick'));
    });
    let res;
    try {
      res = await page.evaluate(BROWSER_SCORE, target);
    } catch {
      res = { ok: false };
    }
    if (res && res.ok) {
      return { locator: page.locator('[data-smartx-pick]'), how: `dom-score(${res.info.score}:${res.info.role || res.info.tag})`, healed: true };
    }
    await page.waitForTimeout(150);
  }
  return null;
}

module.exports = { domResolve };
