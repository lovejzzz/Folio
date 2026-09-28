import { describe, expect, it } from 'vitest';
import { ExportError, type ExportErrorCode } from '@folio/export';
import { en } from '../i18n/en';
import { exportErrorCode, exportErrorMessage, exportFailure } from './exportErrors';
import { GoogleUploadError, type GoogleErrorCode } from './google';

describe('export error messages', () => {
  it('word every export failure in the interface copy, never in the raw message of the error', () => {
    const codes: ExportErrorCode[] = ['noMaterials', 'folioIsTeacherCopy', 'slidesUnwritten'];
    for (const code of codes) {
      const error = new ExportError(code, 'Raw English message.');
      expect(exportErrorMessage(error, en)).toBe(en.export.errors[code]);
      expect(exportErrorMessage(error, en)).not.toMatch(/Raw English/);
    }
  });

  it('keep the code of an error reported by the export worker', () => {
    const fromWorker = exportFailure('folioIsTeacherCopy', 'A Folio file holds the whole course with answers.');
    expect(exportErrorCode(fromWorker, en)).toBe('folioIsTeacherCopy');
    expect(exportErrorMessage(fromWorker, en)).toBe(en.export.errors.folioIsTeacherCopy);
    const unknown = exportFailure(null, 'Out of memory');
    expect(exportErrorCode(unknown, en)).toBeNull();
    expect(exportErrorMessage(unknown, en)).toBe(en.export.failed);
  });

  it('word Google upload failures too', () => {
    const codes: GoogleErrorCode[] = ['googleLoad', 'googleUnavailable', 'googleCancelled', 'googleRefused'];
    for (const code of codes) {
      expect(exportErrorMessage(new GoogleUploadError(code, 'popup_closed_by_user'), en)).toBe(en.export.errors[code]);
    }
    expect(exportErrorMessage(new GoogleUploadError('googleCancelled', 'popup_closed_by_user'), en)).toBe('Google sign-in was cancelled, so nothing was uploaded.');
  });

  it('fall back to one plain sentence for anything unexpected', () => {
    expect(exportErrorMessage(new Error('DataCloneError: could not be cloned'), en)).toBe(en.export.failed);
    expect(exportErrorMessage('boom', en)).toBe(en.export.failed);
  });
});
