#!/usr/bin/env node

const { resolveN, createLookupTXT } = require('..')
const { doh: port } = JSON.parse(process.argv[3])

resolveN(process.argv[2], {
  lookupTXT: createLookupTXT({ endpoints: [`http://0.0.0.0:${port}/dns-query`] })
}).then(
  result => console.log(JSON.stringify(result)),
  error => console.log(JSON.stringify({
    error: {
      message: error.message,
      code: error.code,
      reason: error.reason
    }
  }))
)
