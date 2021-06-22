#!/usr/bin/env node

const dnslink = require('..')
const { doh: port } = JSON.parse(process.argv[3])

dnslink(process.argv[2], {
  doh: `http://0.0.0.0:${port}/dns-query`
}).then(
  result => console.log(JSON.stringify(result)),
  err => console.log(JSON.stringify({ error: err.stack }))
)
