#!/usr/bin/env node
const { AbortController } = require('abort-controller')
const { resolve } = require('../index.js')
const { version } = require('../package.json')
const dns = require('dns')

const json = input => JSON.stringify(input)

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
      if (!this.options.ttl) {
        result.txtEntries = result.txtEntries.map(link => link.value)
        for (const ns in result.links) {
          result.links[ns] = result.links[ns].map(link => link.identifier)
        }
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

    write (domain, { links, log }) {
      const { debug, out, err, ns: searchNS, domains, first: firstNS } = this.options
      const prefix = domains.length > 1 ? `${domain}: ` : ''
      for (const ns in links) {
        for (let { identifier: id, ttl } of links[ns]) {
          if (!searchNS) {
            id = `/${ns}/${id}`
          } else if (ns !== searchNS) {
            continue
          }
          if (this.options.ttl) {
            id += `\t[ttl=${ttl}]`
          }
          out.write(`${prefix}${id}\n`)
          if (firstNS) {
            break
          }
        }
      }
      if (debug) {
        for (const logEntry of log) {
          err.write(`[${logEntry.code}] ${logEntry.entry ? ` entry=${logEntry.entry}` : ''}${logEntry.reason ? ` (${logEntry.reason})` : ''}\n`)
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

    write (lookup, { links, log }) {
      const { debug, out, err, ns: searchNS, first: firstNS } = this.options
      if (this.firstOut) {
        this.firstOut = false
        out.write(`lookup,namespace,identifier${this.options.ttl ? ',ttl' : ''}\n`)
      }

      for (const ns in links) {
        if (searchNS && ns !== searchNS) {
          continue
        }
        for (const { identifier: id, ttl } of links[ns]) {
          out.write(`${csv(lookup)},${csv(ns)},${csv(id)}${this.options.ttl ? `,${csv(ttl)}` : ''}\n`)
        }
        if (firstNS) {
          break
        }
      }
      if (debug) {
        for (const logEntry of log) {
          if (this.firstErr) {
            this.firstErr = false
            err.write('domain,code,entry,reason\n')
          }
          err.write(`${csv(logEntry.domain)},${csv(logEntry.code)},${csv(logEntry.entry)},${csv(logEntry.reason)}\n`)
        }
      }
    }

    end () {}
  }
}

function safeStream (stream, controller) {
  stream.on('error', () => controller.abort())
  return {
    write (data) {
      if (stream.closed || stream.destroyed || stream.errored) return
      stream.write(data)
    }
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
      const first = firstEntry(options.first)
      const ns = first || firstEntry(options.ns) || firstEntry(options.n)
      const out = safeStream(process.stdout, controller)
      const err = safeStream(process.stderr, controller)
      const output = new OutputClass({
        first,
        ns,
        ttl: !!(options.ttl),
        debug: !!(options.debug || options.d),
        domains,
        out,
        err
      })
      let endpoints = (options.endpoint || []).concat(options.e || []).filter(endpoint => endpoint !== true)
      if (endpoints.length === 0) {
        endpoints = dns.getServers().map(ip => `udp://${ip}`)
      }
      await Promise.all(domains.map(async (domain) => {
        output.write(domain, await resolve(domain, {
          endpoints,
          signal
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
    ${command} [--help] [--format=json|text|csv] [--debug] \\
        [--ns=<ns>] [--first=<ns>] [--endpoint[=<endpoint>]] \\
        <hostname> [...<hostname>]

EXAMPLE
    # Receive the dnslink entries for the dnslink.io domain.
    > ${command} dnslink.dev
    /ipfs/QmXNosdfz3WQUHncsYBTw7diwYzCibVhrJmEhNNaMPQBQF

    # Receive only namespace "ipfs" entries as text for dnslink.io.
    > ${command} --ns=ipfs dnslink.dev
    QmXNosdfz3WQUHncsYBTw7diwYzCibVhrJmEhNNaMPQBQF

    # Receive only the first ipfs entry for the "ipfs" namespace.
    > ${command} --first=ipfs dnslink.dev
    QmXNosdfz3WQUHncsYBTw7diwYzCibVhrJmEhNNaMPQBQF

    # Getting information about the --ttl as received from the server.
    > ${command} --ttl dnslink.dev
    /ipfs/QmXNosdfz3WQUHncsYBTw7diwYzCibVhrJmEhNNaMPQBQF  [ttl=53]


    # Receive all dnslink entries for multiple domains as csv.
    > ${command} --format=csv dnslink.dev ipfs.io
    lookup,namespace,identifier
    "ipfs.io","ipns","website.ipfs.io"
    "dnslink.dev","ipfs","QmXNosdfz3WQUHncsYBTw7diwYzCibVhrJmEhNNaMPQBQF"

    # Receive ipfs entries for multiple domains as json.
    > ${command} --format=json dnslink.dev ipfs.io
    [
    {"lookup":"ipfs.io","txtEntries":["/ipns/website.ipfs.io"],"links":{"ipns":["website.ipfs.io"]}}
    ,{"lookup":"dnslink.dev","txtEntries":["/ipfs/QmXNosdfz3WQUHncsYBTw7diwYzCibVhrJmEhNNaMPQBQF"],"links":{"ipfs":["QmXNosdfz3WQUHncsYBTw7diwYzCibVhrJmEhNNaMPQBQF"]}}
    ]

    # Receive both the result and log as csv and redirect each to files.
    > ${command} --format=csv --debug dnslink.io \\
        >dnslink-io.csv \\
        2>dnslink-io.log.csv

OPTIONS
    --help, -h            Show this help.
    --version, -v         Show the version of this command.
    --format, -f          Output format json, text or csv (default=text)
    --ttl                 Include ttl in output (any format)
    --endpoint=<server>,  Specify a dns or doh server to use. If more than
      -e=<server>         one endpoint is specified it will use one of the
                          specified at random. More about specifying
                          servers in the dns-query docs: [1]
    --debug, -d           Render log output to stderr in the specified format.
    --ns, -n              Only render one particular DNSLink namespace.
    --first               Only render the first of the defined DNSLink namespace.

    [1]: https://github.com/martinheidegger/dns-query#string-endpoints

NOTE
    If you don't specify any endpoints, te systems DNS server will be used.

Read more about DNSLink at https://dnslink.dev.

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
