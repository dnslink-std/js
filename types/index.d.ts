/// <reference types="node" />

import { Options as DNSOptions } from 'dns-query';
import { TimeoutOptions } from '@consento/promise';

export enum LogCode {
  fallback = 'FALLBACK',
  invalidEntry = 'INVALID_ENTRY',
}
export enum EntryReason {
  wrongStart = 'WRONG_START',
  keyMissing = 'KEY_MISSING',
  noValue = 'NO_VALUE',
  invalidCharacter = 'INVALID_CHARACTER',
  invalidEncoding = 'INVALID_ENCODING',
}
export enum FQDNReason {
  emptyPart = 'EMPTY_PART',
  tooLong = 'TOO_LONG',
}
export const CODE_MEANING: {
  [key in LogCode | EntryReason | FQDNReason]: string;
};
export interface InvalidEntry {
  code: LogCode.invalidEntry;
  entry: string;
  reason: EntryReason;
}
export interface FallbackEntry {
  code: LogCode.fallback;
}
export type LogEntry = FallbackEntry | InvalidEntry;
export interface Result {
  links: { [key: string]: Array<{ value: string, ttl: number }>; };
  log: LogEntry[];
}
export type LookupTXT = (domain: string, options: TimeoutOptions) => Promise<Array<{ data: string, ttl: number }>>;
export type LookupOptions = Omit<DNSOptions, 'signal' | 'timeout'>;
export interface Options extends TimeoutOptions {
  lookupTXT?: LookupTXT;
}
export const defaultLookupTXT: LookupTXT;
export function createLookupTXT(options: LookupOptions): LookupTXT;
export function resolve(domain: string, options?: Options): Promise<Result>;
export class RCodeError extends Error {
  code: string;
  rcode: number;
  error: string;
  domain: string;
}

export {};
