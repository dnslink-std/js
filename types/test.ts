import { resolve, Options, LogCode, EntryReason, Result, LookupOptions, CODE_MEANING, FQDNReason, createLookupTXT } from '@dnslink/js';
import { AbortController } from '@consento/promise';

const c = new AbortController();

const anyCode: LogCode | EntryReason | FQDNReason = LogCode.fallback;
const meaning: string = CODE_MEANING[anyCode];

resolve('domain.com').then(({ links, log }: Result) => {
  const { ipfs, other }: { ipfs?: string, other?: string } = links;
  for (const logEntry of log) {
    const code: LogCode = logEntry.code;
    /* tslint:disable:prefer-switch */
    if (
      logEntry.code === LogCode.invalidEntry
    ) {
      const entry: string = logEntry.entry;
    }
  }
});
createLookupTXT({
  update: false
})('domain.com', {
  timeout: 5000
}).then(({ entries }) => {
  console.log(entries[0].data);
});

let o: Options = {};
o = { signal: c.signal };
o = { timeout: 1000 };

let lo: LookupOptions = {};
lo = {
  retries: 5
};
lo = {
  endpoints: 'doh'
};
lo = {
  endpoints: 'dns'
};
lo = {
  endpoints: ['udp://1.1.1.1']
};
