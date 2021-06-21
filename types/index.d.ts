/// <reference types="node" />

import { Endpoint } from 'doh-query';
import { Resolver } from 'dns';
import { TimeoutOptions } from '@consento/promise';

declare namespace dnslink {
  enum WarningCode {
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
  interface BaseWarning {
    domain: string;
  }
  interface Conflict extends BaseWarning {
    code: WarningCode.conflictEntry;
    entry: string;
  }
  interface InvalidEntry extends BaseWarning {
    code: WarningCode.invalidEntry;
    entry: string;
    reason: InvalidityReason;
  }
  interface EndlessRedirects extends BaseWarning {
    code: WarningCode.endlessRedirect;
    chain: string[];
  }
  interface InvalidRedirect extends BaseWarning {
    code: WarningCode.invalidRedirect;
    chain: string[];
  }
  interface TooManyRedirects extends BaseWarning {
    code: WarningCode.tooManyRedirects;
    chain: string[];
  }
  interface UnusedEntry extends BaseWarning {
    code: WarningCode.unusedEntry;
    entry: string;
  }
  interface RecursiveDNSlinkPrefix extends BaseWarning {
    code: WarningCode.recursivePrefix;
  }
  type Warning = Conflict | InvalidEntry | EndlessRedirects | InvalidRedirect | TooManyRedirects | UnusedEntry | RecursiveDNSlinkPrefix;
  interface Result {
    domain: string;
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
