import type { ExportErrorCode } from '@folio/export';
import type { Messages } from '../i18n';
import { GoogleUploadError } from './google';

/**
 * An export error's code, whether the error was thrown on this thread or
 * rebuilt from the worker's answer. Checked by shape so the drawer doesn't
 * load the export package (hundreds of KB) just to recognise its errors.
 */
export function exportErrorCode(error: unknown, t: Messages): ExportErrorCode | null {
  if (!(error instanceof Error) || error.name !== 'ExportError') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code in t.export.errors ? (code as ExportErrorCode) : null;
}

/** An export error as the worker reports it, rebuilt on the main thread with its code. */
export function exportFailure(code: ExportErrorCode | null, message: string): Error {
  const error = new Error(message);
  if (code) Object.assign(error, { name: 'ExportError', code });
  return error;
}

/** Why an export failed, in the teacher's language. Unknown failures get one plain sentence, never a raw message. */
export function exportErrorMessage(error: unknown, t: Messages): string {
  if (error instanceof GoogleUploadError) return t.export.errors[error.code];
  const code = exportErrorCode(error, t);
  return code ? t.export.errors[code] : t.export.failed;
}
