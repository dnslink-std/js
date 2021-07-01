const { wrapTimeout } = require('@consento/promise/wrapTimeout')
const { bubbleAbort } = require('@consento/promise/bubbleAbort')
const DNS_PREFIX = '_dnslink.'
const TXT_PREFIX = 'dnslink='
const LogCode = Object.freeze({
  redirect: 'REDIRECT',
  resolve: 'RESOLVE',
  conflictEntry: 'CONFLICT_ENTRY',
  invalidEntry: 'INVALID_ENTRY',
  endlessRedirect: 'ENDLESS_REDIRECT',
  invalidRedirect: 'INVALID_REDIRECT',
  tooManyRedirects: 'TOO_MANY_REDIRECTS',
  unusedEntry: 'UNUSED_ENTRY',
  recursivePrefix: 'RECURSIVE_DNSLINK_PREFIX'
})
const InvalidityReason = Object.freeze({
  wrongStart: 'WRONG_START',
  keyMissing: 'KEY_MISSING',
  noValue: 'NO_VALUE'
})

module.exports = Object.freeze({
  resolve: function dnslink (domain, options = {}) {
    return wrapTimeout(async signal => dnslinkN(domain, { redirect: false, ...options, signal }), options)
  },
  resolveN: function dnslink (domain, options = {}) {
    return wrapTimeout(async signal => dnslinkN(domain, { redirect: true, ...options, signal }), options)
  },
  LogCode: LogCode,
  InvalidityReason: InvalidityReason
})

async function dnslinkN (domain, options) {
  const validated = validateDomain(domain)
  if (validated.error) {
    return { links: {}, path: [], log: [validated.error] }
  }
  let lookup = validated.redirect
  const log = []
  const chain = []
  while (true) {
    const { domain } = lookup
    const { links, redirect } = await resolveDnslink(domain, options, log)
    bubbleAbort(options.signal)
    const resolve = { code: LogCode.resolve, ...lookup }
    if (!redirect) {
      log.push(resolve)
      return { links, path: getPathFromLog(log), log }
    }
    if (chain.includes(redirect.domain)) {
      log.push(resolve)
      log.push({ code: LogCode.endlessRedirect, ...redirect })
      return { links: {}, path: [], log }
    }
    if (chain.length === 31) {
      log.push(resolve)
      log.push({ code: LogCode.tooManyRedirects, ...redirect })
      return { links: {}, path: [], log }
    }
    chain.push(domain)
    log.push({ code: LogCode.redirect, ...lookup })
    lookup = redirect
  }
}

function validateDomain (input) {
  let { domain, pathname, search } = relevantURLParts(input)
  if (domain.startsWith(DNS_PREFIX)) {
    domain = domain.substr(DNS_PREFIX.length)
    if (domain.startsWith(DNS_PREFIX)) {
      return { error: { code: LogCode.recursivePrefix, domain: `${DNS_PREFIX}${domain}`, pathname, search } }
    }
  }
  if (domain.includes(' ')) {
    return { error: { code: LogCode.invalidRedirect, domain, pathname, search } }
  }
  return { redirect: { domain: `${DNS_PREFIX}${domain}`, pathname, search } }
}

function relevantURLParts (input) {
  const url = new URL(input, 'ftp://_')
  let domain
  let pathname
  if (url.hostname !== '_') {
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

async function resolveDnslink (domain, options, log) {
  return resolveTxtEntries(
    domain,
    options,
    (await resolveTxt(domain, options)).reduce((combined, array) => combined.concat(array), []),
    log
  )
}

function resolveTxtEntries (domain, options, txtEntries, log) {
  const dnslinkEntries = txtEntries.filter(entry => entry.startsWith(TXT_PREFIX))

  if (dnslinkEntries.length === 0 && domain.startsWith(DNS_PREFIX)) {
    return {
      redirect: { domain: domain.substr(DNS_PREFIX.length) }
    }
  }
  const found = processEntries(dnslinkEntries, log)
  if (options.redirect && found.dns) {
    const validated = validateDomain(found.dns.value)
    if (validated.error) {
      delete found.dns
      log.push(validated.error)
    } else {
      for (const [key, { entry }] of Object.entries(found)) {
        if (key === 'dns') continue
        log.push({ code: LogCode.unusedEntry, entry })
      }
      return validated
    }
  }
  const links = {}
  for (const [key, { value }] of Object.entries(found)) {
    links[key] = value
  }
  return { links }
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

function processEntries (dnslinkEntries, log) {
  const found = {}
  for (const entry of dnslinkEntries) {
    const validated = validateDNSLinkEntry(entry)
    if (validated.error !== undefined) {
      log.push({ code: LogCode.invalidEntry, entry, reason: validated.error })
      continue
    }
    const { key, value } = validated
    const prev = found[key]
    if (!prev || prev.value > value) {
      if (prev) {
        log.push({ code: LogCode.conflictEntry, entry: prev.entry })
      }
      found[key] = { value, entry }
    } else {
      log.push({ code: LogCode.conflictEntry, entry })
    }
  }
  return found
}

function validateDNSLinkEntry (entry) {
  const trimmed = entry.substr(TXT_PREFIX.length).trim()
  if (!trimmed.startsWith('/')) {
    return { error: InvalidityReason.wrongStart }
  }
  const parts = trimmed.split('/')
  parts.shift()
  let key
  if (parts.length !== 0) {
    key = parts.shift().trim()
  }
  if (!key) {
    return { error: InvalidityReason.keyMissing }
  }
  let value
  if (parts.length !== 0) {
    value = parts.join('/').trim()
  }
  if (!value) {
    return { error: InvalidityReason.noValue }
  }
  return { key, value }
}

function getPathFromLog (log) {
  const path = []
  for (const entry of log.filter(entry => entry.code === LogCode.redirect || entry.code === LogCode.resolve)) {
    if (entry.pathname || entry.search) {
      path.unshift({
        pathname: entry.pathname,
        search: entry.search
      })
    }
  }
  return path
}
