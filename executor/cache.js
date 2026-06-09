'use strict'

// Deterministic selector-learning cache.
//
// After the resolver finds an element, we remember WHICH strategy ("how") won
// for a given (host + target). Next run we try that strategy first, so repeat
// runs are instant and stable — the same trick AtwalLabs' selector-learning
// uses, minus any AI. Persisted as plain JSON so it's inspectable and portable.

const fs = require('fs')
const path = require('path')

const FILE = process.env.SMARTX_CACHE || path.join(process.cwd(), '.smartx-cache.json')

const hostOf = (url) => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/** Stable key for a target on a given host. */
function keyOf(host, target) {
  const w = target.within ? `@${target.within.role || target.within.by}:${target.within.value}` : ''
  return `${host}|${target.by}:${target.value}|${target.role || ''}${w}`
}

function load() {
  const map = new Map()
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    for (const [k, v] of Object.entries(raw)) map.set(k, v)
  } catch {
    /* no cache yet */
  }
  let dirty = false
  return {
    hostOf,
    keyOf,
    get(key) {
      const e = map.get(key)
      return e ? e.how : undefined
    },
    /** Record the winning strategy + a hit counter. */
    set(key, how) {
      const prev = map.get(key)
      if (!prev || prev.how !== how) {
        map.set(key, { how, hits: (prev && prev.hits) || 0 })
        dirty = true
      } else {
        prev.hits++
        dirty = true
      }
    },
    save() {
      if (!dirty) return
      const obj = {}
      for (const [k, v] of map) obj[k] = v
      try {
        fs.writeFileSync(FILE, JSON.stringify(obj, null, 2))
      } catch {
        /* best effort */
      }
    },
    size: () => map.size,
    file: FILE,
  }
}

module.exports = { load }
