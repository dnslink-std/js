/// <reference types="node" />

import { Endpoint } from 'doh-query';
import { Resolver } from 'dns';
import { TimeoutOptions } from '@consento/promise';

export enum LogCode {
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
export enum InvalidityReason {
  wrongStart = 'WRONG_START',
  keyMissing = 'KEY_MISSING',
  noValue = 'NO_VALUE',
}
export interface PathEntry {
  pathname?: string;
  search?: { [key: string]: string [] };
}
export interface DomainEntry extends PathEntry {
  domain: string;
}
export interface Resolve extends DomainEntry {
  code: LogCode.resolve;
}
export interface Redirect extends DomainEntry {
  code: LogCode.redirect;
}
export interface EndlessRedirects extends DomainEntry {
  code: LogCode.endlessRedirect;
}
export interface InvalidRedirect extends DomainEntry {
  code: LogCode.invalidRedirect;
}
export interface TooManyRedirects extends DomainEntry {
  code: LogCode.tooManyRedirects;
}
export interface RecursiveDNSlinkPrefix extends DomainEntry  {
  code: LogCode.recursivePrefix;
}
export interface Conflict {
  code: LogCode.conflictEntry;
  entry: string;
}
export interface InvalidEntry {
  code: LogCode.invalidEntry;
  entry: string;
  reason: InvalidityReason;
}
export interface UnusedEntry {
  code: LogCode.unusedEntry;
  entry: string;
}
export type LogEntry = Resolve | Redirect | Conflict | InvalidEntry | EndlessRedirects | InvalidRedirect | TooManyRedirects | UnusedEntry | RecursiveDNSlinkPrefix;
export interface Result {
  links: { [key: string]: string; };
  path: PathEntry[];
  log: LogEntry[];
}
type MaybeArray<T> = T | T[];
export interface Options extends TimeoutOptions {
  recursive?: boolean;
  dns?: boolean | MaybeArray<string> | Resolver;
  doh?: boolean | MaybeArray<string | Endpoint>;
}
export function resolve(domain: string, options?: Options): Promise<Result>;
export function resolveN(domain: string, options?: Options): Promise<Result>;

export {};
