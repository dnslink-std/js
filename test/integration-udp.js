#!/usr/bin/env node

const { resolveN, createLookupTXT } = require('..')
const { udp: port } = JSON.parse(process.argv[3])

resolveN(process.argv[2], {
  lookupTXT: createLookupTXT({ endpoints: [`udp://127.0.0.1:${port}`] })
}).then(
  result => console.log(JSON.stringify(result)),
  err => console.log(JSON.stringify({ error: err.stack }))
)
