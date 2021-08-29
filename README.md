# @dnslink/js

The reference implementation for DNSLink resolver in JavaScript. Tested in Node.js and in the Browser.

## Usage

You can use `dnslink` both as a [CLI tool](#command-line) or a [library](#javascript-api).

## JavaScript API

Getting started with DNSLink resolution in a jiffy:

```javascript
const { resolve, createLookupTXT, DNSRcodeError } = require('@dnslink/js')

// assumes top-level await
let result
try {
  result = await resolve('dnslink.dev/abcd?foo=bar')
} catch (err) {
  // Errors provided by DNS server
  if (err instanceof DNSRcodeError) {
    err.rcode // Error code number following - https://www.iana.org/assignments/dns-parameters/dns-parameters.xhtml#dns-parameters-6
    err.error // Error code name following (same list)
    err.code // `RCODE_${err.code}
    err.domain // Domain lookup that resulted in the error
    if (err.rcode === 3) {
      // NXDomain = Domain not found; most relevant error
    }
  } else {
    // A variety other errors may be thrown as well. Possible causes include, but are not limited to:
    // - Invalid input
    // - Timeouts / aborts
    // - Networking errors
    // - Incompatible dns packets provided by server
  }
}
const { links, log, txtEntries } = result

// `links` is an object containing given links for the different namespaces
// Each names contains an identifier and a ttl.
links.ipfs === [{ identifier: 'QmTg....yomU', ttl: 60 }]

// The `log` is always an Array and contains a list of log entries
// that were should help to trace back how the linked data was resolved.
Array.isArray(log)

// The `txtEntries` are a reduced form of the links that contains the namespace 
// as part of the value
txtEntries === [{ value: '/ipfs/QmTg....yomU', ttl: 60 }]
```

You can also pass a set of options: 

```javascript
let endpoints // custom endpoints
endpoints = 'dns' // Use the system default dns servers to resolve (Node.js only!)
endpoints = [`udp://1.1.1.1`] // DNS server endpoint
endpoints = 'doh' // Use any of the given default https://github.com/martinheidegger/doh-query/blob/main/endpoints.md
endpoints = ['google'] // Use the "google" endpoint of above list ↑
endpoints = ['https://cloudflare-dns.com/dns-query'] // Use a custom DoH endpoin
// More about ↑ here: https://github.com/martinheidegger/dns-query#string-endpoints

await resolve('dnslink.dev', {
  signal, // AbortSignal that you can use to abort the request
  timeout: 1000, // (optional) timeout for the operation
  lookupTXT: /* (optional) */ createLookupTXT(
    retries: 3, // (optional, default=5)
    endpoints // (optional, defaults )
  )
})
```

## Possible log statements

The statements contained in the `log` are all objects. They may be helpful to figure out why dnslink
is not behaving like you expect. Every statement contains the `.code` property that holds the `.code`
property to understand what happened.
Depending on the warnings code the errors may have additional `.entry` property that holds
the problematic TXT entry. A `.reason` property may contain an additional reason for that error to occur.

| `.code`                  | Meaning                                                                       | Additional properties |
|--------------------------|-------------------------------------------------------------------------------|-----------------------|
| FALLBACK                 | No `_dnslink.` prefixed domain was found. Falling back to the regular domain. |                       |
| INVALID_ENTRY            | A TXT entry with `dnslink=` prefix has formatting errors.                     | `.entry`, `.reason`   |

## Command Line

To use `dnslink` in the command line you will need Node.js installed. 

Install it permanently using `npm i -g @dnslink/js` or run in on-the-fly
using `npx @dnslink/js`.

You can get detailed help for the app by passing a `--help` option at the end:

```
$ npx @dnslink/js --help
```

## License

Published under dual-license: [MIT OR Apache-2.0](./LICENSE)
