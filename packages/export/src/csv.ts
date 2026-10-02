const BOM = '﻿';

/**
 * A cell a spreadsheet would run as a formula ("=HYPERLINK(…)", "@SUM(…)") is written as text, with the
 * apostrophe spreadsheets take to mean so. A plain number such as -5 stays a number.
 */
const FORMULA = /^[=+\-@\t\r]/;
const NUMBER = /^[+-]?\d+(?:[.,]\d+)?%?$/;

function cell(raw: string): string {
  const value = FORMULA.test(raw) && !NUMBER.test(raw.trim()) ? `'${raw}` : raw;
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** RFC 4180 CSV with CRLF line ends, UTF-8 with a BOM so Excel reads CJK text. */
export function renderCsv(rows: string[][]): Uint8Array {
  const body = rows.map((row) => row.map(cell).join(',')).join('\r\n');
  return new TextEncoder().encode(`${BOM}${body}\r\n`);
}
