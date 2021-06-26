import { resolveN, resolve, Options, LogCode, InvalidityReason, Result } from '@dnslink/js';
import { AbortController } from '@consento/promise';
import { Resolver } from 'dns';

const c = new AbortController();

resolveN('some.domain').then(next);
resolve('some.domain').then(next);

function next({ links, log }: Result) {
  const { ipfs, other }: { ipfs?: string, other?: string } = links;
  for (const logEntry of log) {
    const code: LogCode = logEntry.code;
    /* tslint:disable:prefer-switch */
    if (
      logEntry.code === LogCode.conflictEntry ||
      logEntry.code === LogCode.invalidEntry ||
      logEntry.code === LogCode.unusedEntry
    ) {
      const entry: string = logEntry.entry;
    }
    if (
      logEntry.code === LogCode.endlessRedirect ||
      logEntry.code === LogCode.invalidRedirect ||
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
}

let o: Options = {};
o = { signal: c.signal };
o = { timeout: 1000 };
o = {
  dns: true
};
o = {
  dns: new Resolver()
};
o = {
  dns: '127.0.0.1:1234'
};
o = {
  doh: true
};
o = {
  doh: [{ host: '127.0.0.1', port: 1234 }]
};
o = {
  dns: true,
  doh: true
};
o = {
  recursive: true
};
o = {
  recursive: false
};
