const { wrapTimeout } = require('@consento/promise/wrapTimeout')
const { bubbleAbort } = require('@consento/promise/bubbleAbort')
const DNS_PREFIX = '_dnslink.'

function dnslink (domain, options = {}) {
  return wrapTimeout(async signal => {
    return await dnslinkN(domain, { ...options, signal })
  }, options)
}

function getPathFromLog (log) {
  const path = []
  for (const entry of log.filter(entry => entry.code === 'REDIRECT' || entry.code === 'RESOLVE')) {
    if (entry.pathname || entry.search) {
      path.unshift({
        pathname: entry.pathname,
        search: entry.search
      })
    }
  }
  return path
}

dnslink.LogCode = {
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
  // Any log entry given already prevents the fallback from _dnslink.<domain> to <domain>
  if (result.log.length > 0) {
    return false
  }
  /* eslint-disable-next-line no-unreachable-loop */
  for (const _key in result.links) {
    // Any result will also prevent the fallback
    return false
  }
  return true
}

async function dnslinkN (domain, options) {
  options.redirect = options.redirect !== false
  const validated = validateDomain(domain)
  if (validated.error) {
    return { links: {}, path: [], log: [validated.error] }
  }
  let source = validated.redirect
  let log = []
  const chain = []
  while (true) {
    const { domain } = source
    const resolved = await resolveDnslink(domain, options)
    log = log.concat(resolved.log)
    bubbleAbort(options.signal)
    const redirect = getRedirect(domain, resolved)
    const resolve = { code: 'RESOLVE', ...source }
    if (!redirect) {
      const { links } = resolved
      log.push(resolve)
      for (const [key, entry] of Object.entries(links)) {
        links[key] = entry.value
      }
      return {
        links,
        path: getPathFromLog(log),
        log
      }
    }
    for (const key in resolved.links) {
      if (key === 'dns') continue
      log.push({ code: 'UNUSED_ENTRY', entry: resolved.links[key].entry })
    }
    if (chain.includes(redirect.domain)) {
      log.push(resolve)
      log.push({ code: 'ENDLESS_REDIRECT', ...redirect })
      return { links: {}, path: [], log }
    }
    if (chain.length === 31) {
      log.push(resolve)
      log.push({ code: 'TOO_MANY_REDIRECTS', ...redirect })
      return { links: {}, path: [], log }
    }
    chain.push(domain)
    log.push({ code: 'REDIRECT', ...source })
    source = redirect
  }
}

function getRedirect (domain, result) {
  if (result.links.dns) {
    const validated = validateDomain(result.links.dns.value)
    if (validated.error) {
      result.log.push(validated.error)
    } else {
      return validated.redirect
    }
  } else if (domain.startsWith(DNS_PREFIX) && shouldFallbackToDomain(result)) {
    return {
      domain: domain.substr(DNS_PREFIX.length)
    }
  }
}

const PREFIX = 'dnslink='

async function resolveDnslink (domain, options) {
  const txtEntries = (await resolveTxt(domain, options))
    .reduce((combined, array) => combined.concat(array), [])

  const log = []
  const links = {}
  for (const entry of txtEntries) {
    if (!entry.startsWith(PREFIX)) {
      continue
    }
    const validated = validate(entry)
    if (validated.error !== undefined) {
      log.push({ code: 'INVALID_ENTRY', entry, reason: validated.error })
      continue
    }
    const { key, value } = validated
    const prev = links[key]
    if (!prev || prev.value > value) {
      if (prev) {
        log.push({ code: 'CONFLICT_ENTRY', entry: prev.entry })
      }
      links[key] = {
        value,
        entry
      }
    } else {
      log.push({ code: 'CONFLICT_ENTRY', entry })
    }
  }

  return { links, log }
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
