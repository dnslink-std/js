const { wrapTimeout } = require('@consento/promise/wrapTimeout')
const { bubbleAbort } = require('@consento/promise/bubbleAbort')
const { query } = require('dns-query')
const DNS_PREFIX = '_dnslink.'
const TXT_PREFIX = 'dnslink='
const LogCode = Object.freeze({
  redirect: 'REDIRECT',
  resolve: 'RESOLVE',
  invalidEntry: 'INVALID_ENTRY',
  endlessRedirect: 'ENDLESS_REDIRECT',
  invalidRedirect: 'INVALID_REDIRECT',
  tooManyRedirects: 'TOO_MANY_REDIRECTS',
  unusedEntry: 'UNUSED_ENTRY',
  recursivePrefix: 'RECURSIVE_DNSLINK_PREFIX'
})
const EntryReason = Object.freeze({
  wrongStart: 'WRONG_START',
  keyMissing: 'KEY_MISSING',
  noValue: 'NO_VALUE',
  invalidCharacter: 'INVALID_CHARACTER',
  invalidEncoding: 'INVALID_ENCODING'
})
const RedirectReason = Object.freeze({
  emptyPart: 'EMPTY_PART',
  tooLong: 'TOO_LONG'
})
const RCODE = require('dns-packet/rcodes')
const RCODE_ERROR = {
  1: 'FormErr',
  2: 'ServFail',
  3: 'NXDomain',
  4: 'NotImp',
  5: 'Refused',
  6: 'YXDomain',
  7: 'YXRRSet',
  8: 'NXRRSet',
  9: 'NotAuth',
  10: 'NotZone',
  11: 'DSOTYPENI'
}
const RCODE_MESSAGE = {
  // https://www.iana.org/assignments/dns-parameters/dns-parameters.xhtml#dns-parameters-6
  1: 'The name server was unable to interpret the query.',
  2: 'The name server was unable to process this query due to a problem with the name server.',
  3: 'Non-Existent Domain.',
  4: 'The name server does not support the requested kind of query.',
  5: 'The name server refuses to perform the specified operation for policy reasons.',
  6: 'Name Exists when it should not.',
  7: 'RR Set Exists when it should not.',
  8: 'RR Set that should exist does not.',
  9: 'Server Not Authoritative for zone  / Not Authorized.',
  10: 'Name not contained in zone.',
  11: 'DSO-TYPE Not Implemented.'
}
class RCodeError extends Error {
  constructor (rcode, domain) {
    super(`${(RCODE_MESSAGE[rcode] || 'Undefined error.')} (rcode=${rcode}${RCODE_ERROR[rcode] ? `, error=${RCODE_ERROR[rcode]}` : ''}, domain=${domain})`)
    this.rcode = rcode
    this.code = `RCODE_${rcode}`
    this.error = RCODE_ERROR[rcode]
    this.domain = domain
  }
}

function createLookupTXT (baseOptions) {
  return (domain, options = {}) => {
    const q = {
      questions: [{
        type: 'TXT',
        name: domain
      }]
    }
    options = {
      ...baseOptions,
      signal: options.signal,
      timeout: options.timeout || 7500
    }
    return query(q, options)
      .then(data => {
        const rcode = RCODE.toRcode(data.rcode)
        if (rcode !== 0) {
          throw new RCodeError(rcode, domain)
        }
        return (data.answers || []).map(answer => ({
          data: combineTXT(answer.data),
          ttl: answer.ttl
        }))
      })
  }
}

const decoder = new TextDecoder()
function combineTXT (inputs) {
  let string = ''
  for (const input of inputs) {
    if (input instanceof Uint8Array) {
      string += decoder.decode(input, { stream: true })
    } else {
      string += input
    }
  }
  string += decoder.decode()
  return string
}

const defaultLookupTXT = createLookupTXT({})

module.exports = Object.freeze({
  resolve: function dnslink (domain, options = {}) {
    return wrapTimeout(async signal => dnslinkN(domain, { recursive: false, lookupTXT: defaultLookupTXT, ...options, signal }), options)
  },
  resolveN: function dnslink (domain, options = {}) {
    return wrapTimeout(async signal => dnslinkN(domain, { recursive: true, lookupTXT: defaultLookupTXT, ...options, signal }), options)
  },
  RCodeError,
  defaultLookupTXT,
  createLookupTXT,
  reducePath,
  LogCode: LogCode,
  EntryReason,
  RedirectReason
})

async function dnslinkN (domain, options) {
  const validatedDomain = validateDomain({ value: domain })
  if (validatedDomain.error) {
    throw Object.assign(new Error(`Invalid input domain: ${domain}`), { code: validatedDomain.error.code, reason: validatedDomain.error.reason })
  }
  let lookup = validatedDomain.redirect
  const log = []
  const chain = []
  while (true) {
    const { domain } = lookup
    let links
    let redirect
    try {
      const resolved = await resolveDnslink(domain, options, log)
      links = resolved.links
      redirect = resolved.redirect
    } catch (err) {
      if (err.rcode === 3 && domain.startsWith(DNS_PREFIX)) {
        redirect = { domain: domain.substr(DNS_PREFIX.length) }
      } else {
        throw err
      }
    }
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
  let inValue = input.value
  if (inValue.endsWith('.')) {
    inValue = inValue.substr(0, inValue.length - 1)
  }
  if (inValue.startsWith(DNS_PREFIX)) {
    inValue = inValue.substr(DNS_PREFIX.length)
  }
  const index = inValue.indexOf('/')
  const domain = index === -1 ? inValue : inValue.substr(0, index)
  const domainError = testFqdn(domain)
  if (domainError !== undefined) {
    return { error: { code: LogCode.invalidRedirect, entry: input.data, reason: domainError } }
  }
  const { pathname, search } = relevantURLParts(inValue)
  if (domain.startsWith(DNS_PREFIX)) {
    return { error: { code: LogCode.recursivePrefix, domain: `${DNS_PREFIX}${domain}`, pathname, search } }
  }
  return { redirect: { domain: `${DNS_PREFIX}${domain}`, pathname, search } }
}

function testFqdn (domain) {
  // https://en.wikipedia.org/wiki/Domain_name#Domain_name_syntax
  if (domain.length > 253 - 9 /* '_dnslink.'.length */) {
    // > The full domain name may not exceed a total length of 253 ASCII characters in its textual representation.
    return RedirectReason.tooLong
  }

  for (const label of domain.split('.')) {
    if (label.length === 0) {
      return RedirectReason.emptyPart
    }
    if (label.length > 63) {
      return RedirectReason.tooLong
    }
  }
}

function relevantURLParts (input) {
  input = input.trim()
  const url = new URL(input, 'ftp://_')
  let domain
  let pathname
  if (url.hostname !== '_') {
    domain = url.hostname
    if (url.pathname) {
      pathname = url.pathname
    }
  } else if (input.startsWith('/')) {
    domain = ''
    pathname = url.pathname
  } else if (url.pathname) {
    const parts = /^\/([^/]*)(\/.*)?/.exec(url.pathname)
    domain = parts[1]
    pathname = parts[2]
  }
  domain = decodeURIComponent(domain)
  return { search: searchParamsToMap(url.searchParams), domain, pathname }
}

function searchParamsToMap (searchParams) {
  let search
  for (const key of searchParams.keys()) {
    if (search === undefined) {
      search = {}
    }
    search[key] = searchParams.getAll(key)
  }
  return search
}

async function resolveDnslink (domain, options, log) {
  return resolveTxtEntries(
    options,
    await options.lookupTXT(domain, options),
    log
  )
}

function resolveTxtEntries (options, txtEntries, log) {
  const dnslinkEntries = txtEntries.filter(entry => entry.data.startsWith(TXT_PREFIX))
  const found = processEntries(dnslinkEntries, log)
  if (options.recursive && found.dnslink) {
    let validRedirect
    for (const dns of found.dnslink) {
      const validated = validateDomain(dns)
      if (validated.error) {
        log.push(validated.error)
      } else if (validRedirect === undefined) {
        validRedirect = validated
      } else {
        log.push({ code: LogCode.unusedEntry, entry: dns.data })
      }
    }
    delete found.dnslink
    if (validRedirect !== undefined) {
      for (const results of Object.values(found)) {
        for (const { data } of results) {
          log.push({ code: LogCode.unusedEntry, entry: data })
        }
      }
      return validRedirect
    }
  }
  const links = {}
  for (const [key, entries] of Object.entries(found)) {
    links[key] = entries.map(({ value, ttl }) => ({ value, ttl })).sort(sortByValue)
  }
  return { links }
}

function processEntries (dnslinkEntries, log) {
  const found = {}
  for (const entry of dnslinkEntries) {
    const validated = validateDNSLinkEntry(entry.data)
    if (validated.error !== undefined) {
      log.push({ code: LogCode.invalidEntry, entry: entry.data, reason: validated.error })
      continue
    }
    const { key, value } = validated
    const link = { value, ttl: entry.ttl, data: entry.data }
    const list = found[key]
    if (list) {
      list.push(link)
    } else {
      found[key] = [link]
    }
  }
  return found
}

function sortByValue (a, b) {
  if (a.value < b.value) return -1
  if (a.value > b.value) return 1
  return 0
}

function validateDNSLinkEntry (entry) {
  let trimmed = entry.substr(TXT_PREFIX.length).trim()
  if (!trimmed.startsWith('/')) {
    return { error: EntryReason.wrongStart }
  }
  // https://datatracker.ietf.org/doc/html/rfc4343#section-2.1
  if (!/^[\u0020-\u007e]*$/.test(trimmed)) {
    return { error: EntryReason.invalidCharacter }
  }
  try {
    trimmed = decodeURIComponent(trimmed)
  } catch (error) {
    return { error: EntryReason.invalidEncoding }
  }
  const parts = trimmed.split('/')
  parts.shift()
  let key
  if (parts.length !== 0) {
    key = parts.shift().trim()
  }
  if (!key) {
    return { error: EntryReason.keyMissing }
  }
  let value
  if (parts.length !== 0) {
    value = parts.join('/').trim()
  }
  if (!value) {
    return { error: EntryReason.noValue }
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

function reducePath (value, paths) {
  const parts = new URL(`https://ab.c/${value}`)
  let search = searchParamsToMap(parts.searchParams)
  let pathParts = (parts.pathname || '').split('/')
  if (!value.startsWith('/')) {
    pathParts.shift()
  }
  for (const path of paths) {
    let { pathname } = path
    if (pathname) {
      if (pathname.startsWith('/')) {
        pathname = pathname.substr(1)
      }
      if (pathname.startsWith('/')) {
        pathname = pathname.substr(1)
        pathParts = []
      }
      pathParts = pathParts.concat(pathname.split('/'))
    }
    if (path.search) {
      search = combineSearch(path.search, search)
    }
  }
  let result = pathParts.reduce((result, entry, index) => {
    if (entry === '..') {
      result.pop()
    } else if (entry !== '.') {
      result.push(entry)
    }
    return result
  }, []).join('/')
  if (search !== undefined) {
    let sep = '?'
    for (const key of Object.keys(search).sort()) {
      for (const entry of search[key]) {
        result += `${sep}${encodeURIComponent(key)}=${encodeURIComponent(entry)}`
        sep = '&'
      }
    }
  }
  return result
}

function combineSearch (newEntries, search) {
  for (const key in newEntries) {
    for (const entry of newEntries[key]) {
      if (search === undefined) {
        search = {}
      }
      const entries = search[key]
      if (entries === undefined) {
        search[key] = [entry]
      } else {
        entries.push(entry)
      }
    }
  }
  return search
}
