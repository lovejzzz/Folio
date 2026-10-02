import { describe, expect, it } from 'vitest';
import { strToU8 } from 'fflate';
import { CourseFormatError, SCHEMA_VERSION } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { readFolio, writeFolio, zipFiles } from '../src';
import { unzipText } from './helpers';

const course = sampleCourse();

describe('.folio files', () => {
  it('round-trips a course', () => {
    expect(readFolio(writeFolio(course))).toEqual(course);
  });

  it('holds a manifest and each source as text', () => {
    const zip = unzipText(writeFolio(course, '2026-01-01T00:00:00.000Z'));
    const manifest = JSON.parse(zip.text('manifest.json'));
    expect(manifest).toEqual({ format: 'folio', version: 1, schemaVersion: SCHEMA_VERSION, exportedAt: '2026-01-01T00:00:00.000Z', title: course.title });
    for (const id of course.sourceOrder) expect(zip.names).toContain(`sources/${id}.txt`);
  });

  it('reads a bare course JSON file', () => {
    expect(readFolio(strToU8(JSON.stringify(course)))).toEqual(course);
  });

  it('explains what is wrong with a file it cannot read', () => {
    expect(() => readFolio(strToU8('this is not a course'))).toThrow(CourseFormatError);
    expect(() => readFolio(strToU8('this is not a course'))).toThrow('This is not a Folio course file.');
    expect(() => readFolio(new Uint8Array([0x50, 0x4b, 1, 2, 3, 4, 5]))).toThrow(CourseFormatError);
    expect(() => readFolio(strToU8('{ nope'))).toThrow(expect.objectContaining({ code: 'unreadable' }));
    const otherZip = zipFiles([{ name: 'hello.txt', bytes: strToU8('hi') }]);
    expect(() => readFolio(otherZip)).toThrow(expect.objectContaining({ code: 'notFolio' }));
  });

  it('refuses a file from a newer Folio', () => {
    const newer = zipFiles([
      { name: 'manifest.json', bytes: strToU8(JSON.stringify({ format: 'folio', version: 99 })) },
      { name: 'course.json', bytes: strToU8(JSON.stringify(course)) },
    ]);
    expect(() => readFolio(newer)).toThrow('newer version of Folio');
    expect(() => readFolio(newer)).toThrow(expect.objectContaining({ code: 'newerVersion' }));
  });
});

describe('a course file far beyond any real course', () => {
  const course = sampleCourse();

  it('is refused as too large, while a real one opens', () => {
    expect(readFolio(writeFolio(course))).toEqual(course);
    const huge = { ...course, title: 'x'.repeat(300_000) };
    expect(() => readFolio(strToU8(JSON.stringify(huge)))).toThrow('This Folio file is too large to open.');
    const first = course.lessons[course.lessonOrder[0]!]!;
    const lessons = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`l_${i}`, { ...first, id: `l_${i}`, taskIds: [], faqIds: [] }]));
    const many = { ...course, lessons, lessonOrder: Object.keys(lessons) };
    expect(() => readFolio(strToU8(JSON.stringify(many)))).toThrow(CourseFormatError);
  });
});
