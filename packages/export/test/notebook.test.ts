import { orderedLessons, parseCourse, type PageBlock } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { describeExport, exportCourse } from '../src';

const page: PageBlock[] = [
  { id: 'x_1', type: 'text', text: 'This week you load a table.' },
  { id: 'x_2', type: 'heading', level: 2, text: 'Load the scores' },
  { id: 'x_3', type: 'steps', items: [{ id: 'x_3a', text: 'Type the cell below.' }] },
  { id: 'x_4', type: 'code', language: 'python', code: 'scores = [70, 80]\nprint(sum(scores))', caption: '' },
  { id: 'x_5', type: 'steps', items: [{ id: 'x_5a', text: 'Press Shift+Enter.' }] },
  { id: 'x_6', type: 'code', language: 'output', code: '150', caption: '' },
  { id: 'x_7', type: 'callout', kind: 'checkpoint', title: '', text: 'You should see 150.' },
  { id: 'x_8', type: 'code', language: 'python', code: 'len(scores)', caption: '' },
  { id: 'x_9', type: 'code', language: 'shell', code: 'pip list', caption: '' },
];

const base = sampleCourse();
const [first, second] = orderedLessons(base);
const course = parseCourse({ ...base, delivery: 'online-async', lessons: { ...base.lessons, [first!.id]: { ...first!, page } } });

interface Notebook {
  nbformat: number;
  cells: { cell_type: string; source: string[]; outputs?: { text: string[] }[] }[];
}
const notebookIn = async (audience: 'teacher' | 'student'): Promise<Notebook> => {
  const zip = unzipSync((await exportCourse({ course, kinds: ['plan'], audience, format: 'zip' })).bytes);
  const name = Object.keys(zip).find((n) => n.endsWith('.ipynb'))!;
  expect(name).toMatch(/^notebooks\/.+1.+\.ipynb$/);
  return JSON.parse(strFromU8(zip[name]!)) as Notebook;
};

describe('a week with Python, in a zip', () => {
  it('comes with a notebook of the week: its words as text, its Python as cells to run, in the page\'s order', async () => {
    const nb = await notebookIn('student');
    expect(nb.nbformat).toBe(4);
    expect(nb.cells.map((c) => c.cell_type)).toEqual(['markdown', 'markdown', 'code', 'markdown', 'code', 'markdown']);
    expect(nb.cells[2]!.source).toEqual(['scores = [70, 80]\n', 'print(sum(scores))']);
    expect(nb.cells[1]!.source.join('')).toContain('## Load the scores');
    // What the cell printed is not text of the page here: a student sees it when they run the cell.
    expect(nb.cells[3]!.source.join('')).toBe('1. Press Shift+Enter.\n\n> **Checkpoint**  \n> You should see 150.');
    expect(nb.cells[2]!.outputs).toEqual([]);
    // Code that is not Python stays text.
    expect(nb.cells[5]!.source.join('')).toContain('pip list');
  });

  it('shows the teacher what each cell printed', async () => {
    const nb = await notebookIn('teacher');
    expect(nb.cells[2]!.outputs).toEqual([{ output_type: 'stream', name: 'stdout', text: ['150\n'] }]);
    expect(nb.cells[4]!.outputs).toEqual([]);
  });

  it('is there only for weeks that have Python, and only with the pages', () => {
    expect(describeExport({ course, kinds: ['plan'], audience: 'student', format: 'zip' }).contents.filter((n) => n.endsWith('.ipynb'))).toHaveLength(1);
    expect(describeExport({ course, kinds: ['plan'], audience: 'student', format: 'zip', lessonIds: [second!.id] }).contents.some((n) => n.endsWith('.ipynb'))).toBe(false);
    expect(describeExport({ course, kinds: ['quiz'], audience: 'student', format: 'zip' }).contents.some((n) => n.endsWith('.ipynb'))).toBe(false);
  });
});
