import type { ExportFile, ExportRequest } from '@folio/export';
import { proxy, transfer, wrap, type Remote } from 'comlink';
import type { ExportResult, ExportWorkerApi } from '../workers/export.worker';
import { exportFailure } from './exportErrors';

let worker: Remote<ExportWorkerApi> | null = null;

function remote(): Remote<ExportWorkerApi> {
  worker ??= wrap<ExportWorkerApi>(new Worker(new URL('../workers/export.worker.ts', import.meta.url), { type: 'module' }));
  return worker;
}

/**
 * Make an export file in the worker. The course's pictures and files are read here, on the page, and handed to the
 * worker as it asks for each. A worker that stopped is started once more; there is no making the file on the page
 * itself: that kept a second copy of the Word and PowerPoint libraries (750 KB) in the site for browsers without
 * module workers, which cannot run the rest of Folio either.
 */
export async function makeExport(req: ExportRequest): Promise<ExportFile> {
  const { mediaResolver } = await import('./exportMedia');
  const media = mediaResolver(req.course.id);
  // Moved, not copied: a clip is large, and the page has no further use for these bytes.
  const moved: typeof media = async (ref, use) => {
    const found = await media(ref, use);
    return found && transfer(found, [found.bytes.buffer]);
  };
  const once = (): Promise<ExportResult> => remote().exportCourse(req, proxy(moved));
  const result = await once().catch(() => ((worker = null), once()));
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
