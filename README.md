# @dnslink/js

The reference implementation for DNSLink in JavaScript. Tested in Node.js and in the Browser.

## Usage

You can use dnslink both as code and as an CLI tool.

## JavaScript API

Getting started with the dnslink in a jiffy:

```javascript
const dnslink = require('@dnslink/js')

// assumes top-level await
const { links, path, log } = await dnslink('dnslink.dev/abcd?foo=bar')

// `links` is an object containing given links for the different keys
links.ipfs === 'QmTg....yomU'

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
| CONFLICT_ENTRY           | Multiple entries for a key were found and an entry has been ignored. | `.entry`                            |
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
        [--doh[=<server>]] [--dns[=<server>]] <hostname> [...<hostname>]

EXAMPLE
    # Receive the dnslink entries for the dnslink.io domain.
    > dnslink dnslink.io
    /ipfs/QmTgQDr3xNgKBVDVJtyGhopHoxW4EVgpkfbwE4qckxGdyo

    # Receive only the ipfs entry as text for dnslink.io
    > dnslink -k=ipfs dnslink.io
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
    --help, -h        Show this help.
    --version, -v     Show the version of this command.
    --format, -f      Output format json, text or csv (default=json)
    --dns[=<server>]  Specify a dns server to use. If you don't specify a
                      server it will use the system dns service. As server you
                      can specify a domain with port: 1.1.1.1:53
    --doh[=<server>]  Specify a dns-over-https server to use. If you don't
                      specify a server it will use one of the doh servers of
                      the doh-query implementation[1]. You can specify a server
                      either by the  doh-query name (e.g. cloudflare) or as an
                      url: https://cloudflare-dns.com:443/dns-query
    --debug, -d       Render log output to stderr in the specified format.
    --key, -k         Only render one particular dnslink key.

    [1]: https://github.com/martinheidegger/doh-query/blob/main/endpoints.md

NOTE
    If you specify multiple --doh or --dns endpoints, it will at random
    choose either dns or doh as basic mode of operation and use the given
    endpoints for that mode at random.

    Read more about it here: https://github.com/dnslink-std/js#readme
```

## License

Published under dual-license: [MIT OR Apache-2.0](./LICENSE)
