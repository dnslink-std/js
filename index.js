const { wrapTimeout } = require('@consento/promise/wrapTimeout')
const { bubbleAbort } = require('@consento/promise/bubbleAbort')
const { query } = require('dns-query')
const DNS_PREFIX = '_dnslink.'
const TXT_PREFIX = 'dnslink='
const LogCode = Object.freeze({
  fallback: 'FALLBACK',
  invalidEntry: 'INVALID_ENTRY'
})
const EntryReason = Object.freeze({
  wrongStart: 'WRONG_START',
  namespaceMissing: 'NAMESPACE_MISSING',
  noIdentifier: 'NO_IDENTIFIER',
  invalidCharacter: 'INVALID_CHARACTER'
})
const FQDNReason = Object.freeze({
  emptyPart: 'EMPTY_PART',
  tooLong: 'TOO_LONG'
})
const CODE_MEANING = Object.freeze({
  [LogCode.fallback]: 'Falling back to domain without _dnslink prefix.',
  [LogCode.invalidEntry]: 'Entry misformatted, cant be used.',
  [EntryReason.wrongStart]: 'A DNSLink entry needs to start with a /.',
  [EntryReason.namespaceMissing]: 'A DNSLink entry needs to have a namespace, like: dnslink=/namespace/identifier.',
  [EntryReason.noIdentifier]: 'An DNSLink entry needs to have an identifier, like: dnslink=/namespace/identifier.',
  [EntryReason.invalidCharacter]: 'A DNSLink entry may only contain ascii characters.',
  [FQDNReason.emptyPart]: 'A FQDN may not contain empty parts.',
  [FQDNReason.tooLong]: 'A FQDN may be max 253 characters which each subdomain not exceeding 63 characters.'
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
    return wrapTimeout(async signal => _resolve(domain, { lookupTXT: defaultLookupTXT, ...options, signal }))
  },
  RCodeError,
  defaultLookupTXT,
  createLookupTXT,
  LogCode,
  EntryReason,
  FQDNReason,
  CODE_MEANING
})

async function _resolve (domain, options) {
  domain = validateDomain(domain)
  let fallbackResult = null
  let useFallback = false
  const defaultResolve = options.lookupTXT(`${DNS_PREFIX}${domain}`, options)
  const fallbackResolve = options.lookupTXT(domain, options).then(
    result => { fallbackResult = { result } },
    error => { fallbackResult = { error } }
  )
  let data
  try {
    data = await defaultResolve
  } catch (err) {
    if (err.rcode !== 3) {
      throw err
    }
  }
  if (data === undefined) { // Could be undefined if an error occured
    bubbleAbort(options.signal)
    await fallbackResolve
    if (fallbackResult.error) {
      throw fallbackResult.error
    }
    useFallback = true
    data = fallbackResult.result
  }
  const result = processEntries(data)
  if (useFallback) {
    result.log.unshift({ code: LogCode.fallback })
  }
  return result
}

function validateDomain (domain) {
  if (domain.endsWith('.')) {
    domain = domain.substr(0, domain.length - 1)
  }
  if (domain.startsWith(DNS_PREFIX)) {
    domain = domain.substr(DNS_PREFIX.length)
  }
  const domainError = testFqdn(domain)
  if (domainError !== undefined) {
    throw Object.assign(new Error(`Invalid input domain: ${domain}`), { code: 'INVALID_DOMAIN', reason: domainError, domain })
  }
  return domain
}

function testFqdn (domain) {
  // https://en.wikipedia.org/wiki/Domain_name#Domain_name_syntax
  if (domain.length > 253 - 9 /* '_dnslink.'.length */) {
    // > The full domain name may not exceed a total length of 253 ASCII characters in its textual representation.
    return FQDNReason.tooLong
  }

  for (const label of domain.split('.')) {
    if (label.length === 0) {
      return FQDNReason.emptyPart
    }
    if (label.length > 63) {
      return FQDNReason.tooLong
    }
  }
}

function processEntries (input) {
  const links = {}
  const log = []
  for (const entry of input.filter(entry => entry.data.startsWith(TXT_PREFIX))) {
    const { error, parsed } = validateDNSLinkEntry(entry.data)
    if (error !== undefined) {
      log.push({ code: LogCode.invalidEntry, entry: entry.data, reason: error })
      continue
    }
    const { namespace, identifier } = parsed
    const linksByNS = links[namespace]
    const link = { identifier, ttl: entry.ttl }
    if (linksByNS === undefined) {
      links[namespace] = [link]
    } else {
      linksByNS.push(link)
    }
  }
  const txtEntries = []
  // TODO: when removing the trimming of entries, the sorting logic can be simplified
  for (const ns of Object.keys(links).sort()) {
    const linksByNS = links[ns].sort(sortByID)
    for (const { identifier, ttl } of linksByNS) {
      txtEntries.push({ value: `/${ns}/${identifier}`, ttl })
    }
    links[ns] = linksByNS
  }
  return { txtEntries, links, log }
}

function sortByID (a, b) {
  if (a.identifier < b.identifier) return -1
  if (a.identifier > b.identifier) return 1
  return 0
}

function validateDNSLinkEntry (entry) {
  const trimmed = entry.substr(TXT_PREFIX.length).trim()
  if (!trimmed.startsWith('/')) {
    return { error: EntryReason.wrongStart }
  }
  // https://datatracker.ietf.org/doc/html/rfc4343#section-2.1
  if (!/^[\u0020-\u007e]*$/.test(trimmed)) {
    return { error: EntryReason.invalidCharacter }
  }
  const parts = trimmed.split('/')
  parts.shift()
  let namespace
  if (parts.length !== 0) {
    namespace = parts.shift().trim()
  }
  if (!namespace) {
    return { error: EntryReason.namespaceMissing }
  }
  let identifier
  if (parts.length !== 0) {
    identifier = parts.join('/').trim()
  }
  if (!identifier) {
    return { error: EntryReason.noIdentifier }
  }
  return { parsed: { namespace, identifier } }
}
