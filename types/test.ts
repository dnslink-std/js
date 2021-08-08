import { resolve, Options, LogCode, EntryReason, Result, LookupOptions, RCodeError, CODE_MEANING, FQDNReason } from '@dnslink/js';
import { AbortController } from '@consento/promise';

const c = new AbortController();

resolve('some.domain').then(next).catch(
  (err: Error) => {
    if (err instanceof RCodeError) {
      // $ExpectType string
      err.code;
      // $ExpectType number
      err.rcode;
      // $ExpectType string
      err.domain;
      // $ExpectType string
      err.error;
    }
  }
);

const anyCode: LogCode | EntryReason | FQDNReason = LogCode.fallback;
const meaning: string = CODE_MEANING[anyCode];

function next({ links, log }: Result) {
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
}

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
