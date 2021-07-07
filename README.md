# @dnslink/js

The reference implementation for DNSLink in JavaScript. Tested in Node.js and in the Browser.

## Usage

You can use dnslink both as code and as an CLI tool.

## JavaScript API

Getting started with the dnslink in a jiffy:

```javascript
const { resolveN, createLookupTXT } = require('@dnslink/js')

// assumes top-level await
const { links, path, log } = await resolveN('dnslink.dev/abcd?foo=bar')

// `links` is an object containing given links for the different keys
links.ipfs === ['QmTg....yomU']

// The `log` is always an Array and contains a list of log entries
// that were should help to trace back how the linked data was resolved.
Array.isArray(log)

// The `path` is always an Array that may contain a list of paths that
// each link may uses to deep-resolve values. The list is sorted from
// first to last.
path == [{
  pathname: '/abcd',
  search: { foo: ['bar'] }
}]
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

await resolveN('dnslink.dev', {
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
If redirects are employed or 
Note that the order of the `RESOLVE` and `REDIRECT` entries are relevant, as they are point to the `.domain`
at which previous errors occured. The entries between `RESOLVE` and `REDIRECT` statements however may
be shuffled. These and other codes may additionally contain a `.pathname` and `.search` property,
each containing their contribution to the path.


| `.code`                  | Meaning                                                              | Additional properties               |
|--------------------------|----------------------------------------------------------------------|-------------------------------------|
| RESOLVE                  | This domain name will be used for resolving.                         | `.domain`, (`.pathname`, `.search`) |
| REDIRECT                 | Redirecting away from the specified domain name.                     | `.domain`, (`.pathname`, `.search`) |
| INVALID_ENTRY            | A TXT entry with `dnslink=` prefix has formatting errors.            | `.entry`, `.reason`                 |
| RECURSIVE_DNSLINK_PREFIX | The hostname requested contains multiple `_dnslink` prefixes.        |                                     |
| UNUSED_ENTRY             | An entry is unused because a redirect overrides it.                  | `.entry`                            |
| ENDLESS_REDIRECT         | Endless DNSLink redirects detected.                                  | `.domain`, (`.pathname`, `.search`) |
| INVALID_REDIRECT         | A given redirect is of invalid format.                               | `.domain`, (`.pathname`, `.search`) |
| TOO_MANY_REDIRECTS       | Too many redirects happend. (max=32 per dnslink spec)                | `.domain`, (`.pathname`, `.search`) |

## Command Line

To use dnslink in the command line you will need Node.js installed. Then
you can install it permanently using `npm i -g @dnslink/js` or run in on-the-fly
using `npx @dnslink/js`.

You can get detailed help for the app by passing a `--help` option at the end:

```
dnslink - resolve dns links in TXT records

USAGE
    dnslink [--help] [--format=json|text|csv] [--key=<key>] [--debug] \
        [--dns] [--doh] [--endpoint[=<endpoint>]] [--recursive] \
        <hostname> [...<hostname>]

EXAMPLE
    # Recursively receive the dnslink entries for the dnslink.io domain.
    > dnslink -r dnslink.io
    /ipfs/QmTgQDr3xNgKBVDVJtyGhopHoxW4EVgpkfbwE4qckxGdyo

    # Receive only the ipfs entry as text for dnslink.io
    > dnslink -k=ipfs dnslink.io
    QmTgQDr3xNgKBVDVJtyGhopHoxW4EVgpkfbwE4qckxGdyo

    # Receive only the ipfs entry as text for dnslink.io using DNS
    > dnslink -k=ipfs --dns dnslink.io
    QmTgQDr3xNgKBVDVJtyGhopHoxW4EVgpkfbwE4qckxGdyo

    # Receive all dnslink entries for multiple domains as csv
    > dnslink -f=csv dnslink.io ipfs.io
    lookup,key,value,path
    "dnslink.io","ipfs","QmTgQDr3xNgKBVDVJtyGhopHoxW4EVgpkfbwE4qckxGdyo",
    "ipfs.io","ipns","website.ipfs.io",

    # Receive ipfs entries for multiple domains as json
    > dnslink -f=json -k=ipfs dnslink.io website.ipfs.io
    [
    {"lookup":"website.ipfs.io","links":{"ipfs":"bafybeiagozluzfopjadeigrjlsmktseozde2xc5prvighob7452imnk76a"},"path":[]}
    ,{"lookup":"dnslink.io","links":{"ipfs":"QmTgQDr3xNgKBVDVJtyGhopHoxW4EVgpkfbwE4qckxGdyo"},"path":[]}
    ]

    # Receive both the result and log and write the output to files
    > dnslink -f=csv -d dnslink.io \
        >dnslink-io.csv \
        2>dnslink-io.log.csv

OPTIONS
    --help, -h            Show this help.
    --version, -v         Show the version of this command.
    --format, -f          Output format json, text or csv (default=json)
    --dns                 Use one of default dns endpoints.
    --doh                 Use one of default doh endpoints.
    --endpoint=<server>   Specify a dns or doh server to use. If more than
                          one endpoint is specified it will use one of the
                          specified at random. More about specifying
                          servers in the dns-query docs: [1]
    --debug, -d           Render log output to stderr in the specified format.
    --key, -k             Only render one particular dnslink key.
    --recursive, -r       Lookup recursive dnslink entries.

    [1]: https://github.com/martinheidegger/dns-query#string-endpoints

NOTE
    If you specify --dns, --doh and --endpoint will be ignored. If you specify
    --doh then --endpoint will be ignored.

    Read more about dnslink-js here: https://github.com/dnslink-std/js#readme
```

## License

Published under dual-license: [MIT OR Apache-2.0](./LICENSE)
