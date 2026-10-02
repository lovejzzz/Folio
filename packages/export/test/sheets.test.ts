import { describe, expect, it } from 'vitest';
import { strFromU8 } from 'fflate';
import { project } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { quizRows, renderCsv, renderXlsx } from '../src';
import { unzipText } from './helpers';

const course = sampleCourse();

describe('quizRows', () => {
  it('lists every question under its lesson, with answers for the teacher', () => {
    const rows = quizRows(project(course, 'quiz', { audience: 'teacher' }));
    expect(rows[0]).toEqual(['#', 'Lesson', 'Question', 'Format', 'Choices', 'Answer', 'Why']);
    const first = rows[1] ?? [];
    expect(first[0]).toBe('1');
    expect(first[1]).toMatch(/^Lesson 1 · /);
    expect(first[2]).toBe('Which of these is a statistical question?');
    expect(first[4]).toContain('A. How many days are in March?');
    expect(first[6]).toContain('Only the sleep question');
  });

  it('leaves the answer columns out of the student copy', () => {
    const rows = quizRows(project(course, 'quiz', { audience: 'student' }));
    expect(rows[0]).toEqual(['#', 'Lesson', 'Question', 'Format', 'Choices']);
    expect(rows.every((r) => r.length === 5)).toBe(true);
  });
});

describe('renderXlsx', () => {
  it('writes a minimal valid workbook', () => {
    const rows = quizRows(project(course, 'quiz', { audience: 'teacher' }));
    const zip = unzipText(renderXlsx([{ name: 'Quiz & exam bank', rows }]));
    for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
      expect(zip.names).toContain(part);
    }
    const sheet = zip.text('xl/worksheets/sheet1.xml');
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).toContain('Which of these is a statistical question?');
    expect(sheet).toContain('>Answer<');
    expect(zip.text('xl/workbook.xml')).toContain('name="Quiz &amp; exam bank"');
  });

  it('has no answer column for students', () => {
    const rows = quizRows(project(course, 'quiz', { audience: 'student' }));
    const sheet = unzipText(renderXlsx([{ name: 'Quiz', rows }])).text('xl/worksheets/sheet1.xml');
    expect(sheet).not.toContain('>Answer<');
    expect(sheet).not.toContain('Only the sleep question');
    expect(sheet).not.toMatch(/r="F1"/);
  });

  it('escapes markup and drops characters XML cannot hold', () => {
    const sheet = unzipText(renderXlsx([{ name: 'a/b:c', rows: [['<b>&"\u0001\uD800ok']] }]));
    expect(sheet.text('xl/worksheets/sheet1.xml')).toContain('&lt;b&gt;&amp;&quot;ok');
    expect(sheet.text('xl/workbook.xml')).toContain('name="a b c"');
  });
});

describe('renderCsv', () => {
  it('writes a BOM, CRLF line ends and RFC 4180 quoting', () => {
    const bytes = renderCsv([
      ['plain', 'a, "quoted"\nline'],
      ['中文', ''],
    ]);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(strFromU8(bytes.subarray(3))).toBe('plain,"a, ""quoted""\nline"\r\n中文,\r\n');
  });
});

describe('cells a spreadsheet would run', () => {
  it('are written as text, and plain numbers left as they are', () => {
    const csv = new TextDecoder().decode(renderCsv([['=HYPERLINK("http://evil","click")', '@SUM(1)', '+cmd|x', '-2+3', '-5', '+3.2', 'a=b']]));
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""click"")",'@SUM(1),'+cmd|x,'-2+3,-5,+3.2,a=b`);
  });
});
