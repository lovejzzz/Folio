import type { ExportFile, ExportRequest } from '@folio/export';
import { wrap, type Remote } from 'comlink';
import type { ExportResult, ExportWorkerApi } from '../workers/export.worker';
import { exportFailure } from './exportErrors';

let worker: Remote<ExportWorkerApi> | null = null;

function remote(): Remote<ExportWorkerApi> {
  worker ??= wrap<ExportWorkerApi>(new Worker(new URL('../workers/export.worker.ts', import.meta.url), { type: 'module' }));
  return worker;
}

/** Make an export file in the worker; fall back to the main thread if workers are unavailable. */
export async function makeExport(req: ExportRequest): Promise<ExportFile> {
  let result: ExportResult;
  try {
    result = await remote().exportCourse(req);
  } catch {
    // The worker couldn't run at all: make the file here instead.
    const { exportCourse } = await import('@folio/export');
    return exportCourse(req);
  }
  if (result.ok) return result.file;
  throw exportFailure(result.code, result.message);
}

export function download(file: { name: string; mime: string; bytes: Uint8Array }): void {
  const blob = new Blob([file.bytes as BlobPart], { type: file.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
