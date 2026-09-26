import { strToU8, zipSync, type Zippable } from 'fflate';
import { exportLabels, choiceLetter } from './labels';
import type { SemanticDoc } from '@folio/core';
import { printFonts, printPalette } from '@folio/ui/tokens';
import { escapeXml } from './xml';

/**
 * A minimal XLSX writer: inline strings, a bold header row, frozen at the
 * top. Enough for a quiz bank that opens cleanly in Excel, Numbers and
 * Google Sheets without pulling in a spreadsheet library.
 */

export interface Sheet {
  name: string;
  rows: string[][];
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** Style indexes into cellXfs below. */
const STYLE_HEADER = 1;
const STYLE_BODY = 2;

function contentTypes(count: number): string {
  const sheets = Array.from(
    { length: count },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');
  return `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets}</Types>`;
}

const ROOT_RELS = `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

function workbook(names: string[]): string {
  const sheets = names.map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  return `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>${sheets}</sheets></workbook>`;
}

function workbookRels(count: number): string {
  const rels = Array.from(
    { length: count },
    (_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join('');
  const styles = `<Relationship Id="rId${count + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>`;
  return `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">${rels}${styles}</Relationships>`;
}

function styles(): string {
  const font = (bold: boolean) =>
    `<font>${bold ? '<b/>' : ''}<sz val="11"/><color rgb="FF${printPalette.ink}"/><name val="${printFonts.ui}"/></font>`;
  const fills = `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${printPalette.well}"/><bgColor indexed="64"/></patternFill></fill></fills>`;
  const borders = `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF${printPalette.rule}"/></bottom><diagonal/></border></borders>`;
  const align = '<alignment vertical="top" wrapText="1"/>';
  const xfs = `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${align}</xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">${align}</xf></cellXfs>`;
  return `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}"><fonts count="2">${font(false)}${font(true)}</fonts>${fills}${borders}<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>${xfs}<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

/** Column widths in characters, from the longest line in each column. */
function columnWidths(rows: string[][]): number[] {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((value, c) => {
      const longest = Math.max(0, ...value.split('\n').map((line) => Array.from(line).length));
      widths[c] = Math.max(widths[c] ?? 4, Math.min(60, longest + 2));
    });
  }
  return widths;
}

function worksheet(rows: string[][]): string {
  const cols = columnWidths(rows)
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  const data = rows
    .map((row, r) => {
      const style = r === 0 ? STYLE_HEADER : STYLE_BODY;
      const cells = row
        .map(
          (value, c) =>
            `<c r="${choiceLetter(c)}${r + 1}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`,
        )
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const freeze = rows.length > 1 ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '';
  const colsXml = cols ? `<cols>${cols}</cols>` : '';
  return `${XML_HEAD}<worksheet xmlns="${NS_MAIN}"><sheetViews><sheetView workbookViewId="0">${freeze}</sheetView></sheetViews>${colsXml}<sheetData>${data}</sheetData></worksheet>`;
}

/** Excel sheet names: at most 31 characters, none of \ / ? * [ ] :, unique. */
function sheetNames(sheets: Sheet[]): string[] {
  const taken = new Set<string>();
  return sheets.map((sheet, i) => {
    const base = Array.from(sheet.name.replace(/[\\/?*[\]:]/g, ' ').replace(/^'+|'+$/g, '').trim() || `Sheet${i + 1}`)
      .slice(0, 31)
      .join('');
    let name = base;
    for (let k = 2; taken.has(name.toLowerCase()); k += 1) {
      const suffix = ` (${k})`;
      name = `${Array.from(base).slice(0, 31 - suffix.length).join('')}${suffix}`;
    }
    taken.add(name.toLowerCase());
    return name;
  });
}

/** Write a workbook with one sheet per entry; the first row of each sheet is its header. */
export function renderXlsx(sheets: Sheet[]): Uint8Array {
  const list = sheets.length ? sheets : [{ name: 'Sheet1', rows: [] }];
  const files: Zippable = {
    '[Content_Types].xml': strToU8(contentTypes(list.length)),
    '_rels/.rels': strToU8(ROOT_RELS),
    'xl/workbook.xml': strToU8(workbook(sheetNames(list))),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels(list.length)),
    'xl/styles.xml': strToU8(styles()),
  };
  list.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(worksheet(sheet.rows));
  });
  return zipSync(files, { level: 6 });
}

/**
 * The quiz bank as rows: one header row, then one row per question. The
 * lesson is the nearest heading above the question; answers and
 * explanations only appear in the teacher copy.
 */
export function quizRows(doc: SemanticDoc): string[][] {
  const labels = exportLabels(doc.language);
  const h = labels.quizHead;
  const teacher = doc.audience === 'teacher';
  const rows: string[][] = [
    teacher ? [h.n, h.lesson, h.question, h.format, h.choices, h.answer, h.why] : [h.n, h.lesson, h.question, h.format, h.choices],
  ];
  let lesson = '';
  for (const block of doc.blocks) {
    if (block.t === 'heading') lesson = block.text;
    if (block.t !== 'question') continue;
    const choices = block.choices.map((c, i) => `${choiceLetter(i)}. ${c}`).join('\n');
    const row = [String(block.n), lesson, block.prompt, labels.formats[block.format], choices];
    if (teacher) row.push(block.answer ?? '', block.explanation ?? '');
    rows.push(row);
  }
  return rows;
}
