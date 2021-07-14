#!/usr/bin/env node
const { AbortController } = require('@consento/promise')
const { resolve, createLookupTXT, defaultLookupTXT, reducePath } = require('../index')
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
        for (let { value, ttl } of links[key]) {
          if (!searchKey) {
            value = `/${key}/${value}`
          } else if (key !== searchKey) {
            continue
          }
          value += `\t[ttl=${ttl}]`
          for (const part of path) {
            value += `\t[path=${renderPath(part)}]`
          }
          out.write(`${prefix}${value}\n`)
        }
      }
      if (debug) {
        for (const logEntry of log) {
          err.write(`[${logEntry.code}] domain=${logEntry.domain}${logEntry.pathname ? ` pathname=${logEntry.pathname}` : ''}${logEntry.search ? ` search=${renderSearch(logEntry.search)}` : ''}${logEntry.entry ? ` entry=${logEntry.entry}` : ''}${logEntry.reason ? ` (${logEntry.reason})` : ''}\n`)
        }
      }
    }

    end () {}
  },
  reduced: class Reduced {
    constructor (options) {
      this.options = options
    }

    write (domain, { links, log, path }) {
      const { debug, out, err, key: searchKey, domains } = this.options
      const prefix = domains.length > 1 ? `${domain}: ` : ''
      for (const key in links) {
        for (let { value } of links[key]) {
          value = reducePath(value, path)
          if (!searchKey) {
            value = `/${key}/${value}`
          } else if (key !== searchKey) {
            continue
          }
          out.write(`${prefix}${value}\n`)
        }
      }
      if (debug) {
        for (const logEntry of log) {
          err.write(`[${logEntry.code}] domain=${logEntry.domain}${logEntry.pathname ? ` pathname=${logEntry.pathname}` : ''}${logEntry.search ? ` search=${renderSearch(logEntry.search)}` : ''}${logEntry.entry ? ` entry=${logEntry.entry}` : ''}${logEntry.reason ? ` (${logEntry.reason})` : ''}\n`)
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
        out.write('lookup,key,value,ttl,path\n')
      }

      for (const key in links) {
        if (searchKey && key !== searchKey) {
          continue
        }
        for (const { value, ttl } of links[key]) {
          out.write(`${csv(lookup)},${csv(key)},${csv(value)},${csv(ttl)},${csv(path.map(renderPath).join(' → '))}\n`)
        }
      }
      if (debug) {
        for (const logEntry of log) {
          if (this.firstErr) {
            this.firstErr = false
            err.write('domain,pathname,search,code,entry,reason\n')
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
      let lookupTXT
      if (options.dns) {
        lookupTXT = createLookupTXT({ endpoints: 'dns' })
      } else if (options.doh) {
        lookupTXT = createLookupTXT({ endpoints: 'doh' })
      } else {
        const endpoints = (options.endpoint || []).filter(endpoint => endpoint !== true)
        if (endpoints.length > 0) {
          lookupTXT = createLookupTXT({ endpoints })
        }
      }
      await Promise.all(domains.map(async (domain) => {
        output.write(domain, await resolve(domain, {
          recursive: !(options['non-recursive'] || options.nr),
          signal,
          lookupTXT: lookupTXT || defaultLookupTXT
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
        [--dns] [--doh] [--endpoint[=<endpoint>]] [--non-recursive] \\
        <hostname> [...<hostname>]

EXAMPLE
    # Recursively receive the dnslink entries for the dnslink.io domain.
    > ${command} t15.dnslink.dev
    /ipns/AANO      [ttl=3600]

    # Non-Recursively receive the dnslink entries for the t15.dnslink.io test-domain.
    > ${command} --non-recursive 15.dnslink.dev
    /dnslink/1.t15.dnslink.dev  [ttl=3600]
    /ipfs/mnop      [ttl=3600]

    # Receive only the ipfs entry as text for dnslink.io
    > ${command} -k=ipfs dnslink.io
    bafkreidj5lipga46mwq4wdkrrmarjmppobvtsqssge6o5nhkyvsp6pom3u [ttl=60]

    # Receive only the ipfs entry as text for dnslink.io using DNS
    > ${command} -k=ipfs --dns dnslink.io
    bafkreidj5lipga46mwq4wdkrrmarjmppobvtsqssge6o5nhkyvsp6pom3u [ttl=60]

    # Receive all dnslink entries for multiple domains as csv
    > ${command} -f=csv dnslink.io ipfs.io
    lookup,key,value,ttl,path
    "dnslink.io","ipfs","QmTgQDr3xNgKBVDVJtyGhopHoxW4EVgpkfbwE4qckxGdyo",60,
    "ipfs.io","ipns","website.ipfs.io",60,

    # Receive ipfs entries for multiple domains as json
    > ${command} -f=json -k=ipfs dnslink.io website.ipfs.io
    [
    {"lookup":"website.ipfs.io","links":{"ipfs":[{"value":"bafybeiagozluzfopjadeigrjlsmktseozde2xc5prvighob7452imnk76a","ttl":32}]},"path":[]}
    ,{"lookup":"dnslink.io","links":{"ipfs":[{"value":"QmTgQDr3xNgKBVDVJtyGhopHoxW4EVgpkfbwE4qckxGdyo","ttl":120}]},"path":[]}
    ]

    # Receive both the result and log and write the output to files
    > ${command} -f=csv -d dnslink.io \\
        >dnslink-io.csv \\
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
    --key, -k             Only render one particular dnslink key.
    --non-recursive, -nr  Lookup recursive dnslink entries.

    [1]: https://github.com/martinheidegger/dns-query#string-endpoints

NOTE
    If you specify --dns, --doh and --endpoint will be ignored. If you specify
    --doh then --endpoint will be ignored.

    Read more about dnslink-js here: ${homepage}

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
