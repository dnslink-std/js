#!/usr/bin/env node

const { resolve, createLookupTXT } = require('../index.js')
const { udp: port } = JSON.parse(process.argv[3])

resolve(process.argv[2], {
  lookupTXT: createLookupTXT({ endpoints: [`udp://127.0.0.1:${port}`] })
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
