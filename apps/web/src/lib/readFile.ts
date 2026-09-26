import { strFromU8, unzipSync } from 'fflate';

const MAX_BYTES = 2 * 1024 * 1024;

export class FileReadError extends Error {
  constructor(readonly reason: 'size' | 'type') {
    super(reason);
  }
}

/** Plain text from a Word file: paragraphs from word/document.xml. */
function docxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' });
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

/** Read a source file the teacher dropped in: .txt, .md or .docx. */
export async function readSourceFile(file: File): Promise<{ title: string; text: string }> {
  if (file.size > MAX_BYTES) throw new FileReadError('size');
  const title = file.name.replace(/\.[^.]+$/, '');
  if (/\.docx$/i.test(file.name)) return { title, text: docxText(new Uint8Array(await file.arrayBuffer())) };
  if (/\.(txt|md|markdown|csv)$/i.test(file.name) || file.type.startsWith('text/')) return { title, text: (await file.text()).trim() };
  throw new FileReadError('type');
}
