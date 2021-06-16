const { AbortError } = require('doh-query')
const { Resolver } = require('dns').promises

module.exports = async function dnsQuery (domain, options) {
  const { dns, signal } = options
  let resolver
  let resolveTxt = domain => resolver.resolveTxt(domain).catch(err => {
    if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') {
      return []
    }
    throw err
  })
  let onAbort
  if (dns instanceof Resolver) {
    resolver = dns
    if (signal) {
      const abort = new Promise((resolve, reject) => {
        onAbort = () => reject(new AbortError())
      })
      signal.addEventListener('abort', onAbort)
      const _resolveTxt = resolveTxt
      resolveTxt = domain => Promise.race([
        _resolveTxt(domain),
        abort
      ])
    }
  } else {
    resolver = new Resolver()
    let servers
    if (typeof dns === 'string') {
      servers = [dns]
    } else if (Array.isArray(dns)) {
      servers = dns
    }
    if (servers !== undefined) {
      servers = servers.filter(entry => entry !== true)
    }
    if (servers && servers.length > 0) {
      resolver.setServers(shuffleServers(servers))
    }
    if (signal) {
      onAbort = () => resolver.cancel()
      signal.addEventListener('abort', onAbort)
    }
  }
  try {
    return await resolveTxt(domain)
  } catch (err) {
    if (signal && signal.aborted) {
      throw new AbortError()
    }
    throw err
  } finally {
    if (signal && onAbort) {
      signal.removeEventListener('abort', onAbort)
    }
  }
}

let shuffle
function shuffleServers (endpoints) {
  if (endpoints.length === 1) {
    return endpoints.slice()
  }
  if (!shuffle) {
    shuffle = require('array-shuffle')
  }
  return shuffle(endpoints)
}
