/// <reference types="node" />

import { Endpoint } from 'doh-query';
import { Resolver } from 'dns';
import { TimeoutOptions } from '@consento/promise';

declare namespace dnslink {
  enum WarningCode {
    redirect = 'REDIRECT',
    resolve = 'RESOLVE',
    conflictEntry = 'CONFLICT_ENTRY',
    invalidEntry = 'INVALID_ENTRY',
    endlessRedirect = 'ENDLESS_REDIRECT',
    invalidRedirect = 'INVALID_REDIRECT',
    tooManyRedirects = 'TOO_MANY_REDIRECTS',
    unusedEntry = 'UNUSED_ENTRY',
    recursivePrefix = 'RECURSIVE_DNSLINK_PREFIX',
  }
  enum InvalidityReason {
    wrongStart = 'WRONG_START',
    keyMissing = 'KEY_MISSING',
    noValue = 'NO_VALUE',
  }
  interface DomainEntry {
    domain: string;
    pathname?: string;
    search?: { [key: string]: string[]  };
  }
  interface Resolve extends DomainEntry {
    code: WarningCode.resolve;
  }
  interface Redirect extends DomainEntry {
    code: WarningCode.redirect;
  }
  interface EndlessRedirects extends DomainEntry {
    code: WarningCode.endlessRedirect;
  }
  interface InvalidRedirect extends DomainEntry {
    code: WarningCode.invalidRedirect;
  }
  interface TooManyRedirects extends DomainEntry {
    code: WarningCode.tooManyRedirects;
  }
  interface RecursiveDNSlinkPrefix extends DomainEntry  {
    code: WarningCode.recursivePrefix;
  }
  interface Conflict {
    code: WarningCode.conflictEntry;
    entry: string;
  }
  interface InvalidEntry {
    code: WarningCode.invalidEntry;
    entry: string;
    reason: InvalidityReason;
  }
  interface UnusedEntry {
    code: WarningCode.unusedEntry;
    entry: string;
  }
  type Warning = Resolve | Redirect | Conflict | InvalidEntry | EndlessRedirects | InvalidRedirect | TooManyRedirects | UnusedEntry | RecursiveDNSlinkPrefix;
  interface Result {
    found: { [key: string]: string; };
    warnings: Warning[];
  }
  type MaybeArray<T> = T | T[];
  interface Options extends TimeoutOptions {
    dns?: boolean | MaybeArray<string> | Resolver;
    doh?: boolean | MaybeArray<string | Endpoint>;
  }
}
declare function dnslink(domain: string, options?: dnslink.Options): Promise<dnslink.Result>;

export = dnslink;
