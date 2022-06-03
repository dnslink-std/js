import {
  QueryOpts,
  TxtEntry
} from 'dns-query';

export {
  QueryOpts,
  TxtEntry,
  TxtResult,
  EndpointsInput,
} from 'dns-query';

export enum LogCode {
  fallback = 'FALLBACK',
  invalidEntry = 'INVALID_ENTRY',
}
export enum EntryReason {
  wrongStart = 'WRONG_START',
  namepaceMissing = 'NAMESPACE_MISSING',
  noIdentifier = 'NO_IDENTIFIER',
  invalidCharacter = 'INVALID_CHARACTER',
  invalidEncoding = 'INVALID_ENCODING',
}
export enum FQDNReason {
  emptyPart = 'EMPTY_PART',
  tooLong = 'TOO_LONG',
}
export const CODE_MEANING: {
  [code in LogCode | EntryReason | FQDNReason]: string;
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
export interface Links {
  [namespace: string]: Array<{ identifier: string, ttl: number }>;
}
export interface Result {
  txtEntries: TxtEntry[];
  links: Links;
  log: LogEntry[];
}
export function resolve(domain: string, options?: QueryOpts): Promise<Result>;

export {};
