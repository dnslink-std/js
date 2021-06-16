const { wrapTimeout } = require('@consento/promise/wrapTimeout')
const { bubbleAbort } = require('@consento/promise/bubbleAbort')
const DNS_PREFIX = '_dnslink.'

function dnslink (domain, options) {
  return wrapTimeout(signal => dnslinkN(domain, { ...options, signal }, []), options)
}

dnslink.WarningCode = {
  conflictEntry: 'CONFLICT_ENTRY',
  invalidEntry: 'INVALID_ENTRY',
  endlessRedirect: 'ENDLESS_REDIRECT',
  invalidRedirect: 'INVALID_REDIRECT',
  tooManyRedirects: 'TOO_MANY_REDIRECTS',
  unusedEntry: 'UNUSED_ENTRY',
  recursivePrefix: 'RECURSIVE_DNSLINK_PREFIX'
}

dnslink.InvalidityReason = {
  wrongStart: 'WRONG_START',
  keyMissing: 'KEY_MISSING',
  noValue: 'NO_VALUE'
}

module.exports = dnslink

async function dnslinkN (domain, options, chain) {
  bubbleAbort(options.signal)
  const validated = validateDomain(domain)
  if (validated.error) {
    return { found: {}, warnings: [validated.error] }
  }
  const result = await dnslink1(validated.domain, options)
  bubbleAbort(options.signal)
  const redirect = result.found.dns
  if (redirect) {
    chain.push(domain)
    return await followRedirect(redirect.value, options, chain, extractRedirectWarnings(result, domain))
  }
  const { found: foundRaw, warnings } = result
  const found = {}
  for (const key in foundRaw) {
    found[key] = foundRaw[key].value
  }
  return { found, warnings }
}

async function followRedirect (redirect, options, chain, warnings) {
  const cleanDns = validateDomain(redirect)
  if (cleanDns.error) {
    return { found: {}, warnings: [...warnings, cleanDns.error] }
  }
  const { domain } = cleanDns
  if (domain.includes('/')) {
    return { found: {}, warnings: [...warnings, { code: 'INVALID_REDIRECT', chain, domain }] }
  }
  if (chain.includes(domain)) {
    chain.push(redirect)
    return { found: {}, warnings: [...warnings, { code: 'ENDLESS_REDIRECT', chain }] }
  }
  if (chain.length === 32) {
    chain.push(redirect)
    return { found: {}, warnings: [...warnings, { code: 'TOO_MANY_REDIRECTS', chain }] }
  }
  const result = await dnslinkN(domain, options, chain)
  result.warnings = warnings.concat(result.warnings)
  return result
}

function extractRedirectWarnings (result, domain) {
  const { warnings, found } = result
  for (const key in found) {
    if (key === 'dns') continue
    warnings.push({ code: 'UNUSED_ENTRY', entry: found[key].entry, domain })
  }
  return warnings
}

async function dnslink1 (domain, options) {
  const result = await resolveDnslink(`${DNS_PREFIX}${domain}`, options)
  const { warnings } = result
  for (const error of warnings) {
    error.domain = domain
  }
  if (result.warnings.length > 0) {
    // Any warnings given already prevents the fallback
    return result
  }
  /* eslint-disable-next-line no-unreachable-loop */
  for (const _key in result.found) {
    return result
  }
  bubbleAbort(options.signal)
  return await resolveDnslink(domain, options)
}

const PREFIX = 'dnslink='

async function resolveDnslink (domain, options) {
  const txtEntries = (await resolveTxt(domain, options))
    .reduce((combined, array) => combined.concat(array), [])

  const warnings = []
  const found = {}
  for (const entry of txtEntries) {
    if (!entry.startsWith(PREFIX)) {
      continue
    }
    const validated = validate(entry)
    if (validated.error !== undefined) {
      warnings.push({ code: 'INVALID_ENTRY', entry, domain, reason: validated.error })
      continue
    }
    const { key, value } = validated
    const prev = found[key]
    if (!prev || prev.value > value) {
      if (prev) {
        warnings.push({ code: 'CONFLICT_ENTRY', entry: prev.entry, domain })
      }
      found[key] = {
        value,
        entry
      }
    } else {
      warnings.push({ code: 'CONFLICT_ENTRY', entry, domain })
    }
  }

  return { found, warnings }
}

/**
 * @param {string} domain
 * @returns {({ error: { code: string, domain: string } } | { domain: string })}
 */
function validateDomain (domain) {
  if (domain.endsWith('.eth')) {
    domain = `${domain}.link`
  }
  if (domain.startsWith(DNS_PREFIX)) {
    domain = domain.substr(DNS_PREFIX.length)
    if (domain.startsWith(DNS_PREFIX)) {
      return { error: { code: 'RECURSIVE_DNSLINK_PREFIX', domain: `${DNS_PREFIX}${domain}` } }
    }
  }
  return { domain }
}

function validate (entry) {
  const trimmed = entry.substr(PREFIX.length).trim()
  if (!trimmed.startsWith('/')) {
    return { error: 'WRONG_START' }
  }
  const parts = trimmed.split('/')
  parts.shift()
  let key
  if (parts.length !== 0) {
    key = parts.shift().trim()
  }
  if (!key) {
    return { error: 'KEY_MISSING' }
  }
  let value
  if (parts.length !== 0) {
    value = parts.join('/').trim()
  }
  if (!value) {
    return { error: 'NO_VALUE' }
  }
  return { key, value }
}

let dohQuery
let dnsQuery

async function resolveTxt (domain, options) {
  const { doh, dns } = options
  if (!dns || (doh && Math.random() > 0.5)) {
    if (dohQuery === undefined) {
      dohQuery = require('doh-query').query
    }
    const { answers } = await dohQuery({ questions: [{ type: 'TXT', name: domain }] }, {
      signal: options.signal,
      endpoints: doh
    })
    return answers
      .map(entry => Object.values(entry.data).map(entry => entry.toString()))
  }
  if (dnsQuery === undefined) {
    dnsQuery = require('./query-txt.node.js')
  }
  return dnsQuery(domain, options)
}
