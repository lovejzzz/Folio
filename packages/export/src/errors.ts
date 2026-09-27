/**
 * Exports fail with a code, never only a sentence, so the interface can word
 * the reason in the teacher's language. The message is English, for logs.
 */
export type ExportErrorCode = 'noMaterials' | 'folioIsTeacherCopy' | 'slidesUnwritten';

export class ExportError extends Error {
  constructor(
    readonly code: ExportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ExportError';
  }
}

export function isExportError(error: unknown): error is ExportError {
  return error instanceof ExportError;
}
