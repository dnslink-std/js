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
const InvalidityReason = Object.freeze({
  wrongStart: 'WRONG_START',
  keyMissing: 'KEY_MISSING',
  noValue: 'NO_VALUE'
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
function combineTXT (data) {
  if (typeof data === 'string') {
    return data
  }
  if (Array.isArray(data)) {
    if (data.every(entry => entry instanceof Uint8Array)) {
      return combineTXT(concatUint8Arrays(data))
    }
    return data.map(combineTXT).join('')
  }
  return decoder.decode(data)
}

function concatUint8Arrays (arrays) {
  const len = arrays.reduce((len, entry) => len + entry.length, 0)
  const result = new Uint8Array(len)
  let offset = 0
  for (const array of arrays) {
    result.set(array, offset)
    offset += array.length
  }
  return result
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
  InvalidityReason: InvalidityReason
})

async function dnslinkN (domain, options) {
  const validated = validateDomain({ value: domain })
  if (validated.error) {
    throw Object.assign(new Error(`Invalid input domain: ${domain}`), { code: validated.error.code })
  }
  let lookup = validated.redirect
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
  let { domain, pathname, search } = relevantURLParts(input.value)
  if (domain.startsWith(DNS_PREFIX)) {
    domain = domain.substr(DNS_PREFIX.length)
    if (domain.startsWith(DNS_PREFIX)) {
      return { error: { code: LogCode.recursivePrefix, domain: `${DNS_PREFIX}${domain}`, pathname, search } }
    }
  }
  if (domain === '.' || !isFqdn(domain)) {
    return { error: { code: LogCode.invalidRedirect, entry: input.data } }
  }
  if (domain.endsWith('.')) {
    domain = domain.substr(0, domain.length - 1)
  }
  return { redirect: { domain: `${DNS_PREFIX}${domain}`, pathname, search } }
}

function isFqdn (str) {
  if (str[str.length - 1] === '.') {
    str = str.substring(0, str.length - 1)
  }
  if (!str) {
    return false
  }
  const parts = str.split('.')
  const tld = parts[parts.length - 1]

  // disallow fqdns without tld
  if (parts.length < 2) {
    return false
  }

  if (!/^([a-z\u00a1-\uffff]{2,}|xn[a-z0-9-]{2,})$/i.test(tld)) {
    return false
  }

  // disallow spaces && special characers
  if (/[\s\u2002-\u200B\u202F\u205F\u3000\uFEFF\uDB40\uDC20\u00A9\uFFFD]/u.test(tld)) {
    return false
  }

  // disallow all numbers
  if (parts.every(part => /^0-9$/.test(part))) {
    return false
  }

  return parts.every((part) => {
    if (part.length > 63) {
      return false
    }

    if (!/^[a-z\u00a1-\u00ff0-9-]+$/i.test(part)) {
      return false
    }

    // disallow parts starting or ending with hyphen
    if (/^-|-$/.test(part)) {
      return false
    }

    return true
  })
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
    domain,
    options,
    await options.lookupTXT(domain, options),
    log
  )
}

function resolveTxtEntries (domain, options, txtEntries, log) {
  const dnslinkEntries = txtEntries.filter(entry => entry.data.startsWith(TXT_PREFIX))
  const found = processEntries(dnslinkEntries, log)
  if (options.recursive && found.dnslink) {
    let redirect
    for (const dns of found.dnslink) {
      const validated = validateDomain(dns)
      if (validated.error) {
        log.push(validated.error)
      } else if (redirect === undefined) {
        redirect = validated
      } else {
        log.push({ code: LogCode.unusedEntry, entry: dns.data })
      }
    }
    delete found.dnslink
    if (redirect !== undefined) {
      for (const results of Object.values(found)) {
        for (const { data } of results) {
          log.push({ code: LogCode.unusedEntry, entry: data })
        }
      }
      return redirect
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
