# @dnslink/js

The reference implementation for DNSLink resolver in JavaScript. Tested in Node.js and in the Browser.

## Usage

You can use `dnslink` both as a [CLI tool](#command-line) or a [library](#javascript-api).

## JavaScript API

Getting started with DNSLink resolution in a jiffy:

```javascript
const { resolve, createLookupTXT, RCodeError } = require('@dnslink/js')

// assumes top-level await
let result
try {
  result = await resolve('dnslink.dev/abcd?foo=bar')
} catch (err) {
  // Errors provided by DNS server
  if (err instanceof RCodeError) {
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
const { links, log } = result

// `links` is an object containing given links for the different namespaces
// Each names contains an identifier and a ttl.
links.ipfs === [{ identifier: 'QmTg....yomU', ttl: 60 }]

// The `log` is always an Array and contains a list of log entries
// that were should help to trace back how the linked data was resolved.
Array.isArray(log)
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
dnslink - resolve dns links in TXT records

USAGE
    dnslink [--help] [--format=json|text|csv] [--dns] [--doh] [--debug] \
        [--ns=<ns>] [--first=<ns>] [--endpoint[=<endpoint>]] \
        <hostname> [...<hostname>]

EXAMPLE
    # Receive the dnslink entries for the dnslink.io domain.
    > dnslink t15.dnslink.dev
    /ipns/AANO      [ttl=3600]

    # Receive only the ipfs entry as text for dnslink.io
    > dnslink -k=ipfs dnslink.io
    bafkreidj5lipga46mwq4wdkrrmarjmppobvtsqssge6o5nhkyvsp6pom3u [ttl=60]

    # Receive only the ipfs entry as text for dnslink.io using DNS
    > dnslink -k=ipfs --dns dnslink.io
    bafkreidj5lipga46mwq4wdkrrmarjmppobvtsqssge6o5nhkyvsp6pom3u [ttl=60]

    # Receive only the first ipfs entry as text for dnslink.io using DNS
    > dnslink --first=ipfs --dns dnslink.io
    bafkreidj5lipga46mwq4wdkrrmarjmppobvtsqssge6o5nhkyvsp6pom3u [ttl=60]

    # Receive all dnslink entries for multiple domains as csv
    > dnslink -f=csv dnslink.io ipfs.io
    lookup,namespace,identifier,ttl
    "dnslink.io","ipfs","QmTgQDr3xNgKBVDVJtyGhopHoxW4EVgpkfbwE4qckxGdyo",60
    "ipfs.io","ipns","website.ipfs.io",60

    # Receive ipfs entries for multiple domains as json
    > dnslink -f=json -k=ipfs dnslink.io website.ipfs.io
    [
    {"lookup":"website.ipfs.io","links":{"ipfs":[{"identifier":"bafybeiagozluzfopjadeigrjlsmktseozde2xc5prvighob7452imnk76a","ttl":32}]}}
    ,{"lookup":"dnslink.io","links":{"ipfs":[{"identifier":"QmTgQDr3xNgKBVDVJtyGhopHoxW4EVgpkfbwE4qckxGdyo","ttl":120}]}}
    ]

    # Receive both the result and log and write the output to files
    > dnslink -f=csv -d dnslink.io \
        >dnslink-io.csv \
        2>dnslink-io.log.csv

OPTIONS
    --help, -h            Show this help.
    --version, -v         Show the version of this command.
    --format, -f          Output format json, text, reduced or csv (default=text)
    --dns                 Use one of default dns endpoints.
    --doh                 Use one of default doh endpoints.
    --endpoint=<server>   Specify a dns or doh server to use. If more than
                          one endpoint is specified it will use one of the
                          specified at random. More about specifying
                          servers in the dns-query docs: [1]
    --debug, -d           Render log output to stderr in the specified format.
    --ns, -n              Only render one particular DNSLink namespace.
    --first               Only render the first of the defined DNSLink namespace.

    [1]: https://github.com/martinheidegger/dns-query#string-endpoints

NOTE
    If you specify --dns, --doh and --endpoint will be ignored. If you specify
    --doh then --endpoint will be ignored.
```

## License

Published under dual-license: [MIT OR Apache-2.0](./LICENSE)
