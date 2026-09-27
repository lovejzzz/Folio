import { expose } from 'comlink';
import { exportCourse, isExportError, type ExportErrorCode, type ExportFile, type ExportRequest } from '@folio/export';

/**
 * A finished file, or why there is none. Errors are returned rather than
 * thrown because only an error's message survives the trip between threads,
 * and the interface needs its code to word it in the teacher's language.
 */
export type ExportResult = { ok: true; file: ExportFile } | { ok: false; code: ExportErrorCode | null; message: string };

/** Exports run here, off the main thread, so typing never waits on a Word file. */
const api = {
  async exportCourse(req: ExportRequest): Promise<ExportResult> {
    try {
      return { ok: true, file: await exportCourse(req) };
    } catch (error) {
      return { ok: false, code: isExportError(error) ? error.code : null, message: error instanceof Error ? error.message : String(error) };
    }
  },
};

export type ExportWorkerApi = typeof api;

expose(api);
