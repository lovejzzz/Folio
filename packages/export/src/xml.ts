import { cleanText } from '@folio/core';

/** Characters XML 1.0 cannot carry at all, including lone surrogates. */
// eslint-disable-next-line no-control-regex -- the allowed ranges start at tab, newline and carriage return.
const INVALID = /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

/** A document with every string in it made safe to write: see cleanText. */
export function cleanDoc<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc), (_key, value: unknown) => (typeof value === 'string' ? cleanText(value) : value)) as T;
}

/** Escape text for an XML element or attribute, dropping characters XML 1.0 forbids. */
export function escapeXml(value: string): string {
  return value
    .replace(INVALID, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
