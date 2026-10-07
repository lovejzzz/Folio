import type { ExportFormat } from './plan';

/** The type of each file an export makes. Apart from the code that makes them, so the page can name a type without loading it. */
export const MIME: Record<ExportFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
  zip: 'application/zip',
  qti: 'application/zip',
  folio: 'application/zip',
};
