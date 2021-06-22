import dnslink = require('@dnslink/js');
import { Options, WarningCode, InvalidityReason } from '@dnslink/js';
import { AbortController } from '@consento/promise';
import { Resolver } from 'dns';

const c = new AbortController();

const result = dnslink('some.domain');
result.then(({ found, warnings }) => {
  const { ipfs, other }: { ipfs?: string, other?: string } = found;
  for (const warning of warnings) {
    const code: WarningCode = warning.code;
    /* tslint:disable:prefer-switch */
    if (
      warning.code === WarningCode.conflictEntry ||
      warning.code === WarningCode.invalidEntry ||
      warning.code === WarningCode.unusedEntry
    ) {
      const entry: string = warning.entry;
    }
    if (
      warning.code === WarningCode.endlessRedirect ||
      warning.code === WarningCode.invalidRedirect ||
      warning.code === WarningCode.tooManyRedirects
    ) {
      const domain: string = warning.domain;
      const pathname: string | undefined = warning.pathname;
      const search: { [key: string]: string[] } | undefined = warning.search
    }
    if (
      warning.code === WarningCode.recursivePrefix
    ) {
      // No special property
    }
    if (warning.code === WarningCode.invalidEntry) {
      const reason: InvalidityReason = warning.reason;
    }
  }
});

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
