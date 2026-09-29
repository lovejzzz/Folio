import { strFromU8, unzipSync } from 'fflate';

const MAX_BYTES = 10 * 1024 * 1024;
/** A syllabus is a few pages; a whole textbook is more than the model is shown anyway. */
const MAX_PDF_PAGES = 80;
const MAX_UNPACKED = 20 * 1024 * 1024;

export type Refusal = 'size' | 'type' | 'empty';

export class FileReadError extends Error {
  constructor(readonly reason: Refusal) {
    super(reason);
  }
}

/** Why a file wasn't attached. Here, not in the catalog: it is only needed once a file has been read. */
export function refusalMessage(name: string, reason: Refusal): string {
  if (reason === 'size') return `${name} is too large. Files up to 10 MB can be attached.`;
  if (reason === 'empty') return `${name} has no text Folio can read. It may be a scan: paste the text instead.`;
  return `${name} can’t be read. Attach a PDF, Word, .txt or .md file, or paste the text.`;
}

export function refusedMessage(names: string[]): string {
  return `${new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(names)} can’t be attached. Attach PDF, Word, .txt or .md files up to 10 MB.`;
}

/** Plain text from a Word file: paragraphs from word/document.xml. */
function docxText(bytes: Uint8Array): string {
  // A 2 MB Word file can unpack to gigabytes if it was made to: read the text only when it's a sane size.
  const files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' && f.originalSize < MAX_UNPACKED });
  const xml = files['word/document.xml'];
  if (!xml) throw new FileReadError('type');
  const doc = new DOMParser().parseFromString(strFromU8(xml), 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  return Array.from(doc.getElementsByTagNameNS(W, 'p'))
    .map((p) => Array.from(p.getElementsByTagNameNS(W, 't')).map((t) => t.textContent ?? '').join(''))
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The text of a PDF, page by page, as its lines run. pdf.js loads only when a PDF is dropped. A scan has none. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: bytes });
  const doc = await task.promise.catch(() => {
    throw new FileReadError('type');
  });
  try {
    const pages: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PDF_PAGES); n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : '')).join(''));
    }
    const text = pages.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) throw new FileReadError('empty');
    return text;
  } finally {
    void task.destroy();
  }
}

/** Read a source file the teacher dropped in: a PDF, .docx, .txt or .md. */
export async function readSourceFile(file: File): Promise<{ title: string; text: string }> {
  if (file.size > MAX_BYTES) throw new FileReadError('size');
  const title = file.name.replace(/\.[^.]+$/, '');
  if (/\.docx$/i.test(file.name)) return { title, text: docxText(new Uint8Array(await file.arrayBuffer())) };
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') return { title, text: await pdfText(new Uint8Array(await file.arrayBuffer())) };
  if (/\.(txt|md|markdown|csv)$/i.test(file.name) || file.type.startsWith('text/')) return { title, text: (await file.text()).trim() };
  throw new FileReadError('type');
}
