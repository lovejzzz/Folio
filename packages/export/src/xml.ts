/** Characters XML 1.0 cannot carry at all, including lone surrogates. */
const INVALID = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu;

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
