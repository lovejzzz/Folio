import { describe, expect, it } from 'vitest';
import { ExportError, type ExportErrorCode } from '@folio/export';
import { exportErrorCode, exportErrorMessage, exportFailure } from './exportErrors';
import { GoogleUploadError, type GoogleErrorCode } from './google';
import { exportText } from '../i18n/exportText';

describe('export error messages', () => {
  it('word every export failure in the interface copy, never in the raw message of the error', () => {
    const codes: ExportErrorCode[] = ['noMaterials', 'folioIsTeacherCopy', 'slidesUnwritten'];
    for (const code of codes) {
      const error = new ExportError(code, 'Raw English message.');
      expect(exportErrorMessage(error)).toBe(exportText.errors[code]);
      expect(exportErrorMessage(error)).not.toMatch(/Raw English/);
    }
  });

  it('keep the code of an error reported by the export worker', () => {
    const fromWorker = exportFailure('folioIsTeacherCopy', 'A Folio file holds the whole course with answers.');
    expect(exportErrorCode(fromWorker)).toBe('folioIsTeacherCopy');
    expect(exportErrorMessage(fromWorker)).toBe(exportText.errors.folioIsTeacherCopy);
    const unknown = exportFailure(null, 'Out of memory');
    expect(exportErrorCode(unknown)).toBeNull();
    expect(exportErrorMessage(unknown)).toBe(exportText.failed);
  });

  it('word Google upload failures too', () => {
    const codes: GoogleErrorCode[] = ['googleUnfinished', 'googleCancelled', 'googleRefused'];
    for (const code of codes) {
      expect(exportErrorMessage(new GoogleUploadError(code, 'popup_closed_by_user'))).toBe(exportText.errors[code]);
    }
    expect(exportErrorMessage(new GoogleUploadError('googleCancelled', 'popup_closed_by_user'))).toBe('Google sign-in was canceled, so nothing was uploaded.');
  });

  it('fall back to one plain sentence for anything unexpected', () => {
    expect(exportErrorMessage(new Error('DataCloneError: could not be cloned'))).toBe(exportText.failed);
    expect(exportErrorMessage('boom')).toBe(exportText.failed);
  });
});
