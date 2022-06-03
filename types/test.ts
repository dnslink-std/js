import { resolve, LogCode, EntryReason, Result, CODE_MEANING, FQDNReason, QueryOpts } from '@dnslink/js';

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

let o: QueryOpts = {};
o = { signal: c.signal };
o = { timeout: 1000,  };
o = { endpoints: ['dns.google'] };
