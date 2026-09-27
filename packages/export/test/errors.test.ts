import { describe, expect, it } from 'vitest';
import { sampleCourse } from '@folio/core/sample';
import { ExportError, exportCourse, isExportError, renderDocx } from '../src';

describe('export errors carry codes', () => {
  const course = sampleCourse();

  it('a Word export with no materials fails with noMaterials', async () => {
    const failure = exportCourse({ course, kinds: [], audience: 'teacher', format: 'docx' });
    await expect(failure).rejects.toBeInstanceOf(ExportError);
    await expect(failure).rejects.toMatchObject({ code: 'noMaterials' });
    await expect(renderDocx([], { courseTitle: 'x' } as Parameters<typeof renderDocx>[1])).rejects.toMatchObject({ code: 'noMaterials' });
  });

  it('a student copy of a Folio file fails with folioIsTeacherCopy', async () => {
    const failure = exportCourse({ course, kinds: ['quiz'], audience: 'student', format: 'folio' });
    await expect(failure).rejects.toMatchObject({ code: 'folioIsTeacherCopy', name: 'ExportError' });
  });

  it('tells export errors apart from other errors', () => {
    expect(isExportError(new ExportError('slidesUnwritten', 'x'))).toBe(true);
    expect(isExportError(new Error('x'))).toBe(false);
    expect(isExportError({ code: 'noMaterials' })).toBe(false);
  });
});
