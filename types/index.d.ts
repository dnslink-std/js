/// <reference types="node" />

import { Options as DNSOptions } from 'dns-query';
import { TimeoutOptions } from '@consento/promise';

export enum LogCode {
  redirect = 'REDIRECT',
  resolve = 'RESOLVE',
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
export interface InvalidEntry {
  code: LogCode.invalidEntry;
  entry: string;
  reason: InvalidityReason;
}
export interface UnusedEntry {
  code: LogCode.unusedEntry;
  entry: string;
}
export type LogEntry = Resolve | Redirect | InvalidEntry | EndlessRedirects | InvalidRedirect | TooManyRedirects | UnusedEntry | RecursiveDNSlinkPrefix;
export interface Result {
  links: { [key: string]: string[]; };
  path: PathEntry[];
  log: LogEntry[];
}
export type LookupTXT = (domain: string, options: TimeoutOptions) => Promise<Array<{ data: string, ttl: number }>>;
export type LookupOptions = Omit<DNSOptions, 'signal' | 'timeout'>;
export interface Options extends TimeoutOptions {
  recursive?: boolean;
  lookupTXT?: LookupTXT;
}
export const defaultLookupTXT: LookupTXT;
export function createLookupTXT(options: LookupOptions): LookupTXT;
export function resolve(domain: string, options?: Options): Promise<Result>;
export function resolveN(domain: string, options?: Options): Promise<Result>;

export {};
