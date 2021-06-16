# @dnslink/js

The reference implementation for DNSLink in JavaScript. Tested in Node.js and in the Browser.

## Usage

You can use dnslink both as code and as an CLI tool.

## JavaScript API

Getting started with the dnslink in a jiffy:

```javascript
const dnslink = require('@dnslink/js')

// assumes top-level await
const { found, warnings } = await dnslink('dnslink.dev')

// `found` is an object containing given "links" for the different keys
found.ipfs === 'QmTg....yomU'

// The "warnings" is always an Array and may contain a list of warnings (misconfiguration)
// that were found while resolving the linked data.
Array.isArray(warnings)
```

You can also pass a set of options: 

```javascript
let dns = true // Use the system dns service
dns = '1.1.1.1' // DNS server to use
dns = ['1.1.1.1', '1.0.0.1'] // User different servers as fallback
dns = new (require('dns').Resolver)() // Use a custom resolver. This may speed up things if you do many requests

let doh = true // Use one random of https://github.com/martinheidegger/doh-query/blob/main/endpoints.md endpoints
doh = 'google' // Use the "google" endpoint of above list ↑
doh = 'https://cloudflare-dns.com/dns-query' // Use a custom endpoint
doh = ['google', 'cloudflare'] // Use one of two specified endpoints at random

await dnslink('dnslink.dev', {
  signal, // AbortSignal that you can use to abort the request
  timeout: 1000, // (optional) timeout for the operation
  dns, // (optional, default=false) dns can not be used in the browser!
  doh // (optional, default=!dns)
})
```

- Without `dns` and `doh` specified, `doh` will be used as it works both in Node and browsers.
- With `dns` and `doh` specified it will use one mode at random. With that mode it will use one of
    the given "endpoints" for that mode at random.

## Possible warnings

The warnings contained in the `warnings` result are all objects. They may be helpful to figure out why
dnslink is not behaving like you expect. Every warning contains the `.domain` property that holds the
domain where the problem occured (for the case of redirects) and a `.code` property to understand what
happened. Depending on the warnings code the errors may have additional `.entry` property that holds
the problematic TXT entry. For Redirect errors, a `.chain` property may holds the dnslink redirect
domains that were used. A `.reason` property may contain an additional reason for that error to occur.

| `.code`                  | Meaning                                                              | Additional properties |
|--------------------------|----------------------------------------------------------------------|-----------------------|
| CONFLICT_ENTRY           | Multiple entries for a key were found and an entry has been ignored. | `.entry`              |
| INVALID_ENTRY            | A TXT entry with `dnslink=` prefix has formatting errors.            | `.entry`, `.reason`   |
| RECURSIVE_DNSLINK_PREFIX | The hostname requested contains multiple `_dnslink` prefixes.        |                       |
| UNUSED_ENTRY             | An entry is unused because a redirect overrides it.                  | `.entry`              |
| ENDLESS_REDIRECT         | Endless DNSLink redirects detected.                                  | `.chain`              |
| INVALID_REDIRECT         | A given redirect is of invalid format.                               | `.chain`              |
| TOO_MANY_REDIRECTS       | Too many redirects happend. (max=32 per dnslink spec)                | `.chain`              |

## Command Line

To use dnslink in the command line you will need Node.js installed. Then
you can install it permanently using `npm i -g @dnslink/js` or run in on-the-fly
using `npx @dnslink/js`.

You can get detailed help for the app by passing a `--help` option at the end:

```
dnslink [--help] [--format=json|text|csv] [--dns[=<server>]] \
    [--doh[=<server>]] [--key=<key>] [--no-errors] \
    <hostname>|--hostname=<hostname>

Usage:

# Receive the dnslink entries for the dnslink.io domain.
dnslink dnslink.io

# Receive only the ipfs entry as text for dnslink.io
dnslink -o=text -k=ipfs dnslink.io

# Receive both the result and errors and 
dnslink -o=csv -d dnslink.io >dnslink-io.csv 2>dnslink-io_err.csv


Options:

--help, -h, help  Show this help.
--version, -v     Show the version of this command.
--format, -f      Output format json, text or csv (default=json)
--dns[=<server>]  Specify a dns server to use. If you don't specify a server
                  it will use the system dns service. As server you can specify
                  a domain with port: 1.1.1.1:53
--doh[=<server>]  Specify a dns-over-https server to use. If you don't specify
                  a server it will use one of the doh servers of the doh-query
                  implementation[1]. You can specify a server either by the 
                  doh-query name (e.g. cloudflare) or as an url:
                  https://cloudflare-dns.com:443/dns-query
--debug, -d       Render errors to stderr
--key, -k         Only render one particular dnslink key.

[1]: https://github.com/martinheidegger/doh-query/blob/main/endpoints.md


Note: If you specify multiple --doh or --dns endpoints, it will at random
choose either dns or doh as basic mode of operation and use the given endpoints
for that mode at random.

Read more about it here: https://github.com/dnslink-std/js#readme
```

## License

Published under dual-license: [MIT OR Apache-2.0](./LICENSE)
