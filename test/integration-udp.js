#!/usr/bin/env node

const dnslinkN = require('..')
const { udp: port } = JSON.parse(process.argv[3])

dnslinkN(process.argv[2], {
  dns: `127.0.0.1:${port}`
}).then(
  result => {
    for (const [key, value] of Object.entries(result.found)) {
      result.found[key] = value
    }
    console.log(JSON.stringify(result))
  },
  err => console.log(JSON.stringify({ error: err.stack }))
)
