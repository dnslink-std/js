const { wrapTimeout } = require('@consento/promise/wrapTimeout')
const { bubbleAbort } = require('@consento/promise/bubbleAbort')
const DNS_PREFIX = '_dnslink.'

function dnslink (domain, options) {
  return wrapTimeout(signal => {
    const validated = validateDomain(domain)
    if (validated.error) {
      return { found: {}, warnings: [validated.error] }
    }
    return dnslinkN(validated.redirect, { ...options, signal }, [])
  }, options)
}

dnslink.WarningCode = {
  redirect: 'REDIRECT',
  resolve: 'RESOLVE',
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

function shouldFallbackToDomain (result) {
  // Any warnings given already prevents the fallback from _dnslink.<domain> to <domain
  if (result.warnings.length > 0) {
    return false
  }
  /* eslint-disable-next-line no-unreachable-loop */
  for (const _key in result.found) {
    // Any result will also prevent the fallback
    return false
  }
  return true
}

async function dnslinkN (source, options, chain) {
  const { domain, pathname, search } = source
  let result = await resolveDnslink(domain, options)
  bubbleAbort(options.signal)
  let redirect
  if (result.found.dns) {
    const validated = validateDomain(result.found.dns.value)
    if (validated.error) {
      result.warnings.push(validated.error)
    } else {
      redirect = validated.redirect
    }
  } else if (domain.startsWith(DNS_PREFIX) && shouldFallbackToDomain(result)) {
    redirect = {
      domain: domain.substr(DNS_PREFIX.length)
    }
  }
  const resolve = { code: 'RESOLVE', ...source }
  if (redirect) {
    const warnings = extractRedirectWarnings(result)
    if (chain.includes(redirect.domain)) {
      warnings.push(resolve)
      return { found: {}, warnings: [...warnings, { code: 'ENDLESS_REDIRECT', ...redirect }] }
    }
    chain.push(domain)
    if (chain.length === 32) {
      warnings.push(resolve)
      return { found: {}, warnings: [...warnings, { code: 'TOO_MANY_REDIRECTS', ...redirect }] }
    }
    warnings.push({ code: 'REDIRECT', ...source })
    result = await dnslinkN(redirect, options, chain)
    result.warnings = warnings.concat(result.warnings)
    return result
  }
  const { found: foundRaw, warnings } = result
  const found = {}
  for (const key in foundRaw) {
    found[key] = foundRaw[key].value
  }
  warnings.push(resolve)
  return { found, warnings }
}

function extractRedirectWarnings (result) {
  const { warnings, found } = result
  for (const key in found) {
    if (key === 'dns') continue
    warnings.push({ code: 'UNUSED_ENTRY', entry: found[key].entry })
  }
  return warnings
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
      warnings.push({ code: 'INVALID_ENTRY', entry, reason: validated.error })
      continue
    }
    const { key, value } = validated
    const prev = found[key]
    if (!prev || prev.value > value) {
      if (prev) {
        warnings.push({ code: 'CONFLICT_ENTRY', entry: prev.entry })
      }
      found[key] = {
        value,
        entry
      }
    } else {
      warnings.push({ code: 'CONFLICT_ENTRY', entry })
    }
  }

  return { found, warnings }
}

function validateDomain (input) {
  let { domain, pathname, search } = relevantURLParts(input)
  if (domain.startsWith(DNS_PREFIX)) {
    domain = domain.substr(DNS_PREFIX.length)
    if (domain.startsWith(DNS_PREFIX)) {
      return { error: { code: 'RECURSIVE_DNSLINK_PREFIX', domain: `${DNS_PREFIX}${domain}`, pathname, search } }
    }
  }
  if (domain.includes(' ')) {
    return { error: { code: 'INVALID_REDIRECT', domain, pathname, search } }
  }
  return { redirect: { domain: `${DNS_PREFIX}${domain}`, pathname, search } }
}

function relevantURLParts (input) {
  const url = new URL(input, 'xo://')
  let domain
  let pathname
  if (url.hostname) {
    domain = url.hostname
    if (url.pathname) {
      pathname = url.pathname
    }
  } else if (url.pathname) {
    const parts = /^\/([^/]*)(\/.*)?/.exec(url.pathname)
    domain = parts[1]
    pathname = parts[2]
  }
  let search
  for (const key of url.searchParams.keys()) {
    if (search === undefined) {
      search = {}
    }
    search[key] = url.searchParams.getAll(key)
  }
  return { search, domain, pathname }
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
