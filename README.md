# @dnslink/js

The reference implementation for DNSLink resolver in JavaScript. Tested in Node.js and in the Browser.

## Usage

You can use `dnslink` both as a [CLI tool](#command-line) or a [library](#javascript-api).

## JavaScript API

Getting started with DNSLink resolution in a jiffy:

```javascript
import { resolve, DNSRcodeError } from '@dnslink/js'

// assumes top-level await
let result
try {
  result = await resolve('dnslink.dev/abcd?foo=bar', {
    endpoints: ['dns.google'], // required! see more below.
    /* (optional) */
    signal, // AbortSignal that you can use to abort the request
    timeout: 1000, // timeout for the operation
    retries: 3 // retries in case of transport error
  })
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

### Endpoints

You **need** to specify endpoints to be used with the API. You can specify them the same way
as you would in [`dns-query`](https://github.com/martinheidegger/dns-query#endpoints).

## Possible log statements

The log statements follow the [DNSLink specification][log-codes].

[log-codes]: https://github.com/dnslink-std/test/blob/main/LOG_CODES.md

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
