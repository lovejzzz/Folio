const BOM = '﻿';

function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** RFC 4180 CSV with CRLF line ends, UTF-8 with a BOM so Excel reads CJK text. */
export function renderCsv(rows: string[][]): Uint8Array {
  const body = rows.map((row) => row.map(cell).join(',')).join('\r\n');
  return new TextEncoder().encode(`${BOM}${body}\r\n`);
}
