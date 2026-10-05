import { exhibitText, type Lesson, type PageBlock } from '@folio/core';

/**
 * A week's page as a Jupyter notebook: the page's words as text cells and its Python as cells to run, in the
 * page's order. A student opens it and runs the week instead of typing it; the teacher's copy also shows what
 * each cell printed when Folio ran it.
 */

const PYTHON = new Set(['python', 'py', 'python3']);
export const isPythonCell = (b: PageBlock): boolean => b.type === 'code' && PYTHON.has(b.language);
const isOutput = (b: PageBlock | undefined): b is Extract<PageBlock, { type: 'code' }> => b?.type === 'code' && b.language === 'output';

/** A week has a notebook when its page has Python to run. */
export const hasNotebook = (lesson: Lesson): boolean => lesson.page.some(isPythonCell);

/** A block of the page as Markdown, or nothing for what a notebook has no place for (a clip, a file to download). */
function markdown(b: PageBlock): string {
  switch (b.type) {
    case 'heading':
      return `${'#'.repeat(b.level)} ${b.text}`;
    case 'text':
      return b.text;
    case 'list':
      return b.items.map((i) => `- ${i}`).join('\n');
    case 'steps':
      return b.items.map((s, i) => `${i + 1}. ${s.text}`).join('\n');
    case 'callout':
      return `> **${[b.kind[0]!.toUpperCase() + b.kind.slice(1), b.title].filter(Boolean).join(': ')}**  \n> ${b.text.replace(/\n+/g, '\n>\n> ')}`;
    case 'code':
      return `\`\`\`${b.language === 'output' ? '' : b.language}\n${b.code}\n\`\`\``;
    case 'terms':
      return b.items.map((t) => `**${t.term}**: ${t.meaning}`).join('\n\n');
    case 'exhibit':
      return exhibitText(b);
    case 'image':
      return b.caption ? `*${b.caption}*` : '';
    default:
      return '';
  }
}

/** A notebook keeps each line as its own string, the line break with it. */
const lines = (text: string): string[] => text.split('\n').map((l, i, all) => (i < all.length - 1 ? `${l}\n` : l)).filter(Boolean);

interface Cell {
  cell_type: 'markdown' | 'code';
  metadata: Record<string, never>;
  source: string[];
  execution_count?: null;
  outputs?: { output_type: 'stream'; name: 'stdout'; text: string[] }[];
}

function cells(page: readonly PageBlock[], withOutputs: boolean): Cell[] {
  const out: Cell[] = [];
  const text: string[] = [];
  const flush = (): void => {
    if (text.length) out.push({ cell_type: 'markdown', metadata: {}, source: lines(text.splice(0).join('\n\n')) });
  };
  // What a cell printed is the first output block after it and before the next cell: a step often stands between.
  const printed = (from: number): PageBlock | undefined => {
    for (const b of page.slice(from + 1)) if (isOutput(b) || isPythonCell(b)) return isOutput(b) ? b : undefined;
    return undefined;
  };
  const shown = new Set<PageBlock>();
  page.forEach((b, i) => {
    if (shown.has(b) || b.type === 'checklist') return;
    if (!isPythonCell(b) || b.type !== 'code') return void (markdown(b) && text.push(markdown(b)));
    flush();
    const output = printed(i);
    if (output) shown.add(output);
    out.push({ cell_type: 'code', metadata: {}, source: lines(b.code), execution_count: null, outputs: withOutputs && isOutput(output) ? [{ output_type: 'stream', name: 'stdout', text: lines(`${output.code}\n`) }] : [] });
  });
  flush();
  return out;
}

/** The notebook file for one week. `withOutputs`: the teacher's copy, which shows what each cell printed. */
export function weekNotebook(lesson: Lesson, withOutputs: boolean): Uint8Array {
  const notebook = {
    cells: [{ cell_type: 'markdown', metadata: {}, source: [`# ${lesson.title}`] }, ...cells(lesson.page, withOutputs)],
    metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' }, language_info: { name: 'python' } },
    nbformat: 4,
    nbformat_minor: 5,
  };
  return new TextEncoder().encode(`${JSON.stringify(notebook, null, 1)}\n`);
}
