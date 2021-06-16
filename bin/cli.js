#!/usr/bin/env node
const AbortController = require('abort-controller')
const dnslink = require('../index')
const { version, homepage } = require('../package.json')

const json = input => JSON.stringify(input, null, 2) + '\n'
const formats = {
  json: {
    single: (found) => {
      /* eslint-disable-next-line no-unreachable-loop */
      for (const key in found) {
        return json(found[key])
      }
      return 'null'
    },
    many: json,
    warnings: warnings => json({ warnings })
  },
  text: {
    single (found) {
      /* eslint-disable-next-line no-unreachable-loop */
      for (const key in found) {
        return found[key]
      }
      return ''
    },
    many (found) {
      let result = ''
      for (const key in found) {
        result += `${key}=${found[key]}\n`
      }
      return result
    },
    warnings (warnings) {
      let result = ''
      for (const warning of warnings) {
        result += `[${warning.code}] domain=${warning.domain} ${warning.entry ? `error=${warning.entry}` : ''} ${warning.chain ? `chain=${warning.chain}` : ''} ${warning.reason ? `(${warning.reason})` : ''}\n`
      }
      return result
    }
  },
  csv: {
    single (found) {
      return this.many(found)
    },
    many (found) {
      let result = 'key,value\n'
      for (const key in found) {
        result += `${csv(key)},${csv(found[key])}`
      }
      return result
    },
    warnings (warnings) {
      let result = 'domain,code,entry,chain,reason\n'
      for (const warning of warnings) {
        result += `${csv(warning.code)},${csv(warning.domain)},${csv(warning.entry)},${csv(warning.chain)},${csv(warning.reason)}\n`
      }
      return result
    }
  }
}

module.exports = (command) => {
  ;(async function main () {
    const controller = new AbortController()
    const { signal } = controller
    process.on('SIGINT', onSigint)
    try {
      const { options, rest } = getOptions(process.argv.slice(2))
      if (options.help || options.h || rest.includes('help')) {
        showHelp(command)
        return 0
      }
      if (options.v || options.version) {
        showVersion()
        return 0
      }
      if (rest.length === 0) {
        showHelp(command)
        return 1
      }
      const format = firstEntry(options.format) || firstEntry(options.f) || 'text'
      const formatter = formats[format]
      if (!formatter) {
        throw new Error(`Unexpected format ${format}`)
      }
      const { found, warnings } = await dnslink(rest[0] || options.hostname, {
        signal,
        doh: options.doh,
        dns: options.dns
      })
      const key = firstEntry(options.key) || firstEntry(options.k)
      let data
      if (key) {
        const result = {}
        if (found[key]) {
          result[key] = found[key]
        }
        data = formatter.single(result)
      } else {
        data = formatter.many(found)
      }
      process.stdout.write(data)
      if ((options.debug || options.d) && warnings.length > 0) {
        process.stderr.write(formatter.warnings(warnings))
      }
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
  console.log(`
${command} [--help] [--format=json|text|csv] [--key=<key>] [--debug] \\
    [--doh[=<server>]] [--dns[=<server>]] <hostname>|--hostname=<hostname>

Usage:

# Receive the dnslink entries for the dnslink.io domain.
${command} dnslink.io

# Receive only the ipfs entry as text for dnslink.io
${command} -o=text -k=ipfs dnslink.io

# Receive both the result and errors and 
${command} -o=csv -d dnslink.io >dnslink-io.csv 2>dnslink-io_err.csv


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
--debug, -d       Render warnings to stderr in the specified format.
--key, -k         Only render one particular dnslink key.

[1]: https://github.com/martinheidegger/doh-query/blob/main/endpoints.md


Note: If you specify multiple --doh or --dns endpoints, it will at random
choose either dns or doh as basic mode of operation and use the given endpoints
for that mode at random.

Read more about it here: ${homepage}

dnslink-js@${version}
`)
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
  if (entry === null || entry === undefined) {
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
