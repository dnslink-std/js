/// <reference types="node" />

import { Endpoint } from 'doh-query';
import { Resolver } from 'dns';
import { TimeoutOptions } from '@consento/promise';

declare namespace dnslink {
  enum LogCode {
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
    code: LogCode.resolve;
  }
  interface Redirect extends DomainEntry {
    code: LogCode.redirect;
  }
  interface EndlessRedirects extends DomainEntry {
    code: LogCode.endlessRedirect;
  }
  interface InvalidRedirect extends DomainEntry {
    code: LogCode.invalidRedirect;
  }
  interface TooManyRedirects extends DomainEntry {
    code: LogCode.tooManyRedirects;
  }
  interface RecursiveDNSlinkPrefix extends DomainEntry  {
    code: LogCode.recursivePrefix;
  }
  interface Conflict {
    code: LogCode.conflictEntry;
    entry: string;
  }
  interface InvalidEntry {
    code: LogCode.invalidEntry;
    entry: string;
    reason: InvalidityReason;
  }
  interface UnusedEntry {
    code: LogCode.unusedEntry;
    entry: string;
  }
  type LogEntry = Resolve | Redirect | Conflict | InvalidEntry | EndlessRedirects | InvalidRedirect | TooManyRedirects | UnusedEntry | RecursiveDNSlinkPrefix;
  interface Result {
    links: { [key: string]: string; };
    path: {
      pathname?: string,
      search?: { [key: string]: string [] }
    };
    log: LogEntry[];
  }
  type MaybeArray<T> = T | T[];
  interface Options extends TimeoutOptions {
    dns?: boolean | MaybeArray<string> | Resolver;
    doh?: boolean | MaybeArray<string | Endpoint>;
  }
}
declare function dnslink(domain: string, options?: dnslink.Options): Promise<dnslink.Result>;

export = dnslink;
