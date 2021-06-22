#!/usr/bin/env node
const AbortController = require('abort-controller')
const dnslink = require('../index')
const { version, homepage } = require('../package.json')

const json = input => JSON.stringify(input)
const renderSearch = search => {
  if (!search) {
    return null
  }
  const entries = Object.entries(search)
  if (entries.length === 0) {
    return ''
  }
  return `?${entries
    .map(([key, values]) => values
      .map(value => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&')
    )
    .join('&')}`
}
const renderPath = part => `${part.pathname || ''}${renderSearch(part.search) || ''}`

const outputs = {
  json: class JSON {
    constructor (options) {
      this.options = options
      this.firstOut = true
      this.firstErr = true
      const { debug, out, err, domains } = options
      if (domains.length > 1) {
        out.write('[\n')
      }
      if (debug) {
        err.write('[\n')
      }
    }

    write (lookup, result) {
      const { debug, out, err, domains } = this.options
      if (this.firstOut) {
        this.firstOut = false
      } else {
        out.write('\n,')
      }
      const outLine = domains.length > 1
        ? Object.assign({ lookup }, result)
        : Object.assign({}, result)
      delete outLine.log
      out.write(json(outLine))
      if (debug) {
        for (const statement of result.log) {
          let prefix = ''
          if (this.firstErr) {
            this.firstErr = false
          } else {
            prefix = '\n,'
          }
          const errLine = domains.length > 1
            ? Object.assign({ lookup }, statement)
            : statement
          err.write(prefix + json(errLine))
        }
      }
    }

    end () {
      const { debug, out, err, domains } = this.options
      if (domains.length > 1) {
        out.write('\n]')
      }
      if (debug) {
        err.write('\n]')
      }
    }
  },
  text: class Text {
    constructor (options) {
      this.options = options
    }

    write (domain, { links, log, path }) {
      const { debug, out, err, key: searchKey, domains } = this.options
      const prefix = domains.length > 1 ? `${domain}: ` : ''
      for (const key in links) {
        let value = links[key]
        for (const part of path) {
          value += ` [${renderPath(part)}]`
        }
        if (searchKey) {
          if (key !== searchKey) {
            continue
          }
          out.write(`${prefix}${value}\n`)
        } else {
          out.write(`${prefix}/${key}/${value}\n`)
        }
      }
      if (debug) {
        for (const logEntry of log) {
          err.write(`[${logEntry.code}] domain=${logEntry.domain} ${logEntry.pathname ? `pathname=${logEntry.pathname}` : ''} ${logEntry.search ? `search=${renderSearch(logEntry.search)}` : ''} ${logEntry.entry ? `error=${logEntry.entry}` : ''} ${logEntry.reason ? `(${logEntry.reason})` : ''}\n`)
        }
      }
    }

    end () {}
  },
  csv: class CSV {
    constructor (options) {
      this.options = options
      this.firstOut = true
      this.firstErr = true
    }

    write (lookup, { links, log, path }) {
      const { debug, out, err, key: searchKey } = this.options
      if (this.firstOut) {
        this.firstOut = false
        out.write('lookup,key,value,path\n')
      }

      for (const key in links) {
        if (searchKey && key !== searchKey) {
          continue
        }
        out.write(`${csv(lookup)},${csv(key)},${csv(links[key])},${csv(path.map(renderPath).join(' → '))}\n`)
      }
      if (debug) {
        for (const logEntry of log) {
          if (this.firstErr) {
            this.firstErr = false
            if (debug) {
              err.write('domain,pathname,search,code,entry,reason\n')
            }
          }
          err.write(`${csv(logEntry.domain)},${csv(logEntry.pathname)},${csv(renderSearch(logEntry.search))},${csv(logEntry.code)},${csv(logEntry.entry)},${csv(logEntry.reason)}\n`)
        }
      }
    }

    end () {}
  }
}

module.exports = (command) => {
  ;(async function main () {
    const controller = new AbortController()
    const { signal } = controller
    process.on('SIGINT', onSigint)
    try {
      const { options, rest: domains } = getOptions(process.argv.slice(2))
      if (options.help || options.h) {
        showHelp(command)
        return 0
      }
      if (options.v || options.version) {
        showVersion()
        return 0
      }
      if (domains.length === 0) {
        showHelp(command)
        return 1
      }
      const format = firstEntry(options.format) || firstEntry(options.f) || 'text'
      const OutputClass = outputs[format]
      if (!OutputClass) {
        throw new Error(`Unexpected format ${format}`)
      }
      const key = firstEntry(options.key) || firstEntry(options.k)
      const output = new OutputClass({
        key,
        debug: !!(options.debug || options.d),
        domains,
        out: process.stdout,
        err: process.stderr
      })
      await Promise.all(domains.map(async (domain) => {
        output.write(domain, await dnslink(domain, {
          signal,
          doh: options.doh,
          dns: options.dns
        }))
      }))
      output.end()
    } finally {
      process.off('SIGINT', onSigint)
    }

    function onSigint () {
      controller.abort()
    }
  })()
    .then(
      code => process.exit(code),
      err => {
        console.error((err && (err.stack || err.message)) || err)
        process.exit(1)
      }
    )
}

function showHelp (command) {
  console.log(`${command} - resolve dns links in TXT records

USAGE
    ${command} [--help] [--format=json|text|csv] [--key=<key>] [--debug] \\
        [--doh[=<server>]] [--dns[=<server>]] <hostname> [...<hostname>]

EXAMPLE
    # Receive the dnslink entries for the dnslink.io domain.
    > ${command} dnslink.io
    /ipfs/QmTgQDr3xNgKBVDVJtyGhopHoxW4EVgpkfbwE4qckxGdyo

    # Receive only the ipfs entry as text for dnslink.io
    > ${command} -k=ipfs dnslink.io
    QmTgQDr3xNgKBVDVJtyGhopHoxW4EVgpkfbwE4qckxGdyo

    # Receive all dnslink entries for multiple domains as csv
    > ${command} -f=csv dnslink.io ipfs.io
    lookup,key,value,path
    "dnslink.io","ipfs","QmTgQDr3xNgKBVDVJtyGhopHoxW4EVgpkfbwE4qckxGdyo",
    "ipfs.io","ipns","website.ipfs.io",

    # Receive ipfs entries for multiple domains as json
    > ${command} -f=json -k=ipfs dnslink.io website.ipfs.io
    [
    {"lookup":"website.ipfs.io","links":{"ipfs":"bafybeiagozluzfopjadeigrjlsmktseozde2xc5prvighob7452imnk76a"},"path":[]}
    ,{"lookup":"dnslink.io","links":{"ipfs":"QmTgQDr3xNgKBVDVJtyGhopHoxW4EVgpkfbwE4qckxGdyo"},"path":[]}
    ]

    # Receive both the result and log and write the output to files
    > ${command} -f=csv -d dnslink.io \\
        >dnslink-io.csv \\
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

    Read more about it here: ${homepage}

dnslink-js@${version}`)
}

function firstEntry (maybeArray) {
  if (maybeArray) {
    return maybeArray[0]
  }
}

function getOptions (args) {
  const options = {}
  const addOption = (name, value) => {
    if (options[name] === undefined) {
      options[name] = [value]
    } else {
      options[name].push(value)
    }
  }
  const rest = []
  for (const arg of args) {
    const parts = /^--?([^=]+)(=(.*))?/.exec(arg)
    if (parts) {
      const key = parts[1]
      const value = parts[3]
      addOption(key, value || true)
      continue
    }
    rest.push(arg)
  }
  return { options, rest }
}

function csv (entry) {
  if (entry === null || entry === undefined || entry === '') {
    return ''
  }
  if (Array.isArray(entry)) {
    entry = entry.join(' - ')
  }
  if (entry === true || entry === false || typeof entry === 'number') {
    return entry
  }
  return `"${entry.toString().replace(/"/g, '""')}"`
}

function showVersion () {
  console.log(version)
}
