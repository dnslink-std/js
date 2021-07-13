import { resolveN, resolve, Options, LogCode, InvalidityReason, Result, LookupOptions, RCodeError } from '@dnslink/js';
import { AbortController } from '@consento/promise';

const c = new AbortController();

resolveN('some.domain').then(next);
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

function next({ links, path, log }: Result) {
  const { ipfs, other }: { ipfs?: string, other?: string } = links;
  for (const logEntry of log) {
    const code: LogCode = logEntry.code;
    /* tslint:disable:prefer-switch */
    if (
      logEntry.code === LogCode.invalidEntry ||
      logEntry.code === LogCode.invalidRedirect ||
      logEntry.code === LogCode.unusedEntry
    ) {
      const entry: string = logEntry.entry;
    }
    if (
      logEntry.code === LogCode.endlessRedirect ||
      logEntry.code === LogCode.tooManyRedirects
    ) {
      const domain: string = logEntry.domain;
      const pathname: string | undefined = logEntry.pathname;
      const search: { [key: string]: string[] } | undefined = logEntry.search;
    }
    if (
      logEntry.code === LogCode.recursivePrefix
    ) {
      // No special property
    }
    if (logEntry.code === LogCode.invalidEntry) {
      const reason: InvalidityReason = logEntry.reason;
    }
  }
  for (const entry of path) {
    const pathname: string | undefined = entry.pathname;
    const search = entry.search;
    if (search !== undefined) {
      for (const key in search) {
        const entries: string[] = search[key];
      }
    }
  }
}

let o: Options = {};
o = { signal: c.signal };
o = { timeout: 1000 };
o = {
  recursive: true
};
o = {
  recursive: false
};

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
