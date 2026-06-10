'use strict'

// Thin client to CALL a (remote) Smart API and get back action-JSON.
//
// Use this from any runner (AtwalLabs, Sachaflow, CI) to translate plain-English
// steps without bundling the engine:
//
//   const { translate } = require('./client')
//   const r = await translate(['Click Login', 'Type x in the Email field'], {
//     apiKey: process.env.SMART_API_KEY,
//     org: 'atwallabs',                 // -> X-Org-Id (per-org KB)
//     url: 'https://app.example.com',
//   })
//   // r.actions  -> feed to your executor
//   // r.confidence, r.warnings, r.meta.unmatchedSteps -> diagnostics

const https = require('https')
const http = require('http')

const DEFAULT_BASE = process.env.SMART_API_URL || 'https://smartapi.atwallabs.com'

function post(urlStr, headers, bodyObj, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const lib = u.protocol === 'https:' ? https : http
    const body = JSON.stringify(bodyObj)
    const req = lib.request(
      u,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers },
        timeout: timeoutMs,
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) })
          } catch (e) {
            reject(new Error(`bad JSON from Smart API (${res.statusCode}): ${data.slice(0, 200)}`))
          }
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('Smart API request timed out')))
    req.write(body)
    req.end()
  })
}

/**
 * Translate steps via a remote Smart API.
 * @param {string[]} steps
 * @param {{apiKey?:string, org?:string, url?:string, testName?:string,
 *          outputFormat?:'actions'|'playwright', baseUrl?:string, timeoutMs?:number}} opts
 * @returns {Promise<{actions?:object[], code?:string, confidence:object,
 *          confidenceScore:number, warnings:string[], assumptions:string[], meta:object}>}
 */
async function translate(steps, opts = {}) {
  const baseUrl = opts.baseUrl || DEFAULT_BASE
  const headers = {}
  if (opts.apiKey) headers['x-api-key'] = opts.apiKey
  if (opts.org) headers['x-org-id'] = opts.org
  const payload = {
    testName: opts.testName || 'run',
    url: opts.url || 'https://example.com',
    steps,
    outputFormat: opts.outputFormat || 'actions',
  }
  const { status, body } = await post(
    `${baseUrl}/api/v1/playwright/generate`,
    headers,
    payload,
    opts.timeoutMs || 15000,
  )
  if (status !== 200 || !body.success) {
    const msg = body && (body.message || body.error) ? `${body.error}: ${body.message}` : `HTTP ${status}`
    throw new Error(`Smart API translate failed — ${msg}`)
  }
  return body
}

module.exports = { translate }
