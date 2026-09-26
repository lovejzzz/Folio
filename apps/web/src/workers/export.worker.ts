import { expose } from 'comlink';
import { exportCourse } from '@folio/export';

/** Exports run here, off the main thread, so typing never waits on a Word file. */
const api = { exportCourse };

export type ExportWorkerApi = typeof api;

expose(api);
