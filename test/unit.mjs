import { resolve } from '../index.mjs'
import tape from 'fresh-tape'

// Note: this is currently a simple test to make sure that the code compiles and
//       runs in te browser, not a thorough API test.
tape('basic API test', function (t) {
  return resolve('t02.dnslink.dev', {
    endpoints: ['https://1.1.1.1'] // Using a pretty stable doh endpoint to work with.
  }).then(data => {
    let ttl = data && data.txtEntries && data.txtEntries[0] && data.txtEntries[0].ttl
    t.deepEquals(data, {
      txtEntries: [
        { value: '/testkey/ABCD', ttl }
      ],
      links: {
        testkey: [
          { identifier: 'ABCD', ttl }
        ]
      },
      log: [
        { code: 'FALLBACK' }
      ]
    })
  })
})

tape('done.', { skip: typeof window === 'undefined' }, function () {
  window.close()
})
