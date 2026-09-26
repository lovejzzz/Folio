import { describe, expect, it } from 'vitest';
import { strToU8 } from 'fflate';
import { CourseFormatError } from '@folio/core';
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
    expect(manifest).toEqual({ format: 'folio', version: 1, schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z', title: course.title });
    for (const id of course.sourceOrder) expect(zip.names).toContain(`sources/${id}.txt`);
  });

  it('reads a bare course JSON file', () => {
    expect(readFolio(strToU8(JSON.stringify(course)))).toEqual(course);
  });

  it('explains what is wrong with a file it cannot read', () => {
    expect(() => readFolio(strToU8('this is not a course'))).toThrow(CourseFormatError);
    expect(() => readFolio(strToU8('this is not a course'))).toThrow('This is not a Folio course file.');
    expect(() => readFolio(new Uint8Array([0x50, 0x4b, 1, 2, 3, 4, 5]))).toThrow(CourseFormatError);
    expect(() => readFolio(strToU8('{ nope'))).toThrow(CourseFormatError);
    const otherZip = zipFiles([{ name: 'hello.txt', bytes: strToU8('hi') }]);
    expect(() => readFolio(otherZip)).toThrow('This is not a Folio course file.');
  });

  it('refuses a file from a newer Folio', () => {
    const newer = zipFiles([
      { name: 'manifest.json', bytes: strToU8(JSON.stringify({ format: 'folio', version: 99 })) },
      { name: 'course.json', bytes: strToU8(JSON.stringify(course)) },
    ]);
    expect(() => readFolio(newer)).toThrow('newer version of Folio');
  });
});
