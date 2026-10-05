import { OnlineSchema, orderedLessons, type Course } from '@folio/core';
import type { Cell, CellResult, Runner } from '@folio/run';
import { describe, expect, it } from 'vitest';
import { generateSection, runCells } from '../src';
import { ModuleDraft } from '../src/online';
import { fakeInference, smallCourse } from './fake';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const result = (over: Partial<CellResult>): CellResult => ({ stdout: '', stderr: '', value: null, error: null, figures: [], figuresDropped: 0, cut: false, loadError: null, sessionLost: false, ms: 1, ...over });

/** A runner that answers each cell from a table by the cell's first line. */
function fakeRunner(answers: Record<string, Partial<CellResult>>): Runner & { ran: string[] } {
  const ran: string[] = [];
  return {
    ran,
    run: async (cell: Cell) => {
      ran.push(cell.code);
      return result(answers[cell.code.split('\n')[0]!] ?? {});
    },
    reset: async () => undefined,
    versions: async () => ({ python: '3.14.2', pandas: '3.0.2' }),
    close: () => undefined,
  };
}

type Blocks = ModuleDraft['parts'][number]['blocks'];
const page = (blocks: object[]): ModuleDraft =>
  ModuleDraft.parse({
    keyIdeas: ['a', 'b'],
    intro: 'i',
    checklist: [1, 2, 3, 4].map((n) => ({ label: `Do ${n}`, activity: 'build', minutes: 45 })),
    parts: [
      { title: 'Count the rows', blocks },
      { title: 'Try it', blocks: [{ type: 'text', text: 'Now you.' }] },
    ],
    wrapUp: 'w',
    vocabulary: [],
    facilitation: { announcement: 'a', watchFor: ['x', 'y'], feedback: ['x', 'y'] },
  });
const code = (text: string, kind = 'python') => ({ type: 'code', kind, text });
const kinds = (blocks: Blocks) => blocks.map((b) => (b.type === 'code' ? `${b.kind}:${b.text}` : b.type === 'image' ? `image:${b.kind}` : b.type));

describe('a page whose Python is run', () => {
  it('shows what each cell really prints: in place of what was written, under a cell that had none, past the step between', async () => {
    const v = page([code('rows = 12\nprint(rows)'), { type: 'steps', items: ['Press Shift+Enter.'] }, code('11', 'output'), code('rows * 2'), code('silent = 1'), code('0', 'output'), code('dotnet run', 'shell')]);
    const ran = await runCells(fakeRunner({ 'rows = 12': { stdout: '12\n' }, 'rows * 2': { value: '24' } }), v);
    expect(kinds(ran.value.parts[0]!.blocks)).toEqual(['python:rows = 12\nprint(rows)', 'steps', 'output:12', 'python:rows * 2', 'output:24', 'python:silent = 1', 'shell:dotnet run']);
    expect(ran).toMatchObject({ cells: 3, notes: [] });
  });

  it('tells the mend of a cell that fails, with the error and its line, and not of the cells that fail after it for want of its names', async () => {
    const v = page([code('import pandas as pd\ndf = pd.read_csv("scores.csv")\ndf.resample("M")'), code('ok', 'output'), code('print(total)\ntotal = df.sum()'), code('print(1)')]);
    const runner = fakeRunner({ 'import pandas as pd': { error: { type: 'ValueError', message: 'Invalid frequency: M', line: 3, traceback: '' } }, 'print(total)': { error: { type: 'NameError', message: "name 'total' is not defined", line: 1, traceback: '' } }, 'print(1)': { stdout: '1\n' } });
    const ran = await runCells(runner, v);
    expect(ran.notes).toHaveLength(1);
    expect(ran.notes[0]!.values).toMatchObject({ where: 'Part 1, Count the rows' });
    expect(ran.notes[0]!.values.text).toContain('on Python 3.14.2, pandas 3.0.2, and failed at its line 3 (df.resample("M")): ValueError: Invalid frequency: M');
    // What was written stays under a cell that failed, until the mend has put the cell right.
    expect(kinds(ran.value.parts[0]!.blocks).slice(0, 2)).toEqual([expect.stringContaining('python:import pandas'), 'output:ok']);
  });

  it('leaves alone an error the page means to show, and a cell that waits for the student\'s own function', async () => {
    const v = page([code('scores["z"]'), code("KeyError: 'z'", 'output'), code('assert mean_of([1, 2]) == 1.5'), code('raise NotImplementedError')]);
    const ran = await runCells(fakeRunner({ 'scores["z"]': { error: { type: 'KeyError', message: "'z'", line: 1, traceback: '' } }, 'assert mean_of([1, 2]) == 1.5': { error: { type: 'NameError', message: "name 'mean_of' is not defined", line: 1, traceback: '' } }, 'raise NotImplementedError': { error: { type: 'NotImplementedError', message: '', line: 1, traceback: '' } } }), v);
    expect(ran.notes).toEqual([]);
    expect(kinds(ran.value.parts[0]!.blocks)).toEqual(['python:scores["z"]', "output:KeyError: 'z'", 'python:assert mean_of([1, 2]) == 1.5', 'python:raise NotImplementedError']);
  });

  it('tells the mend of a sentence that quotes a number the code does not print, and of nothing else that differs', async () => {
    const blocks = [code('print(df.mean())'), code('72.5\ndtype: object', 'output'), { type: 'text', text: 'The mean is 72.5, a little above the pass mark of 70.' }, code('print(df.dtypes)'), code('object', 'output'), { type: 'text', text: 'Each column has a type.' }];
    const ran = await runCells(fakeRunner({ 'print(df.mean())': { stdout: '74.25\ndtype: str\n' }, 'print(df.dtypes)': { stdout: 'str\n' } }), page(blocks));
    expect(ran.notes).toHaveLength(1);
    expect(ran.notes[0]!.values.text).toMatch(/^The text gives 72\.5 as what the code prints\. Run, the code prints:\n74\.25/);
  });

  it('puts a figure under its cell, and makes the picture the writer asked for of the chart into the chart', async () => {
    const asked = { type: 'image', text: 'Your histogram should look like this.', shows: 'The cell and its histogram', alt: 'A histogram with one peak near 70.' };
    const ran = await runCells(fakeRunner({ 'df.hist()': { figures: [{ png: PNG, widthIn: 6, heightIn: 4 }] }, 'df.plot()': { stdout: 'ok\n', figures: [{ png: PNG, widthIn: 6, heightIn: 4 }] } }), page([code('df.hist()'), asked, code('df.plot()')]), 2);
    const blocks = ran.value.parts[0]!.blocks;
    expect(kinds(blocks)).toEqual(['python:df.hist()', 'image:run:2-1', 'python:df.plot()', 'output:ok', 'image:run:2-2']);
    expect(blocks[1]).toMatchObject({ alt: 'A histogram with one peak near 70.', text: 'Your histogram should look like this.' });
    expect(Object.keys(ran.figures)).toEqual(['run:2-1', 'run:2-2']);
    // Run again, the page is the same: an earlier run's figures are replaced, not added to.
    expect(kinds((await runCells(fakeRunner({ 'df.hist()': { figures: [{ png: PNG, widthIn: 6, heightIn: 4 }] }, 'df.plot()': { stdout: 'ok\n', figures: [{ png: PNG, widthIn: 6, heightIn: 4 }] } }), ran.value, 3)).value.parts[0]!.blocks)).toEqual(['python:df.hist()', 'image:run:3-1', 'python:df.plot()', 'output:ok', 'image:run:3-2']);
  });
});

describe('a week written with a runner', () => {
  const online = (): Course => ({ ...smallCourse(), delivery: 'online-async', online: OnlineSchema.parse({ hoursPerWeek: 3 }) });
  const written = page([code('print(len(rows))'), code('11', 'output'), code('rows.plot()')]);
  const answers = { 'print(len(rows))': { stdout: '12\n' }, 'rows.plot()': { figures: [{ png: PNG, widthIn: 6, heightIn: 4 }] } };
  const blocksOf = (commands: { payload: unknown }[]) => (commands[0]!.payload as { content: { page: { type: string; code?: string; src?: string }[] } }).content.page;

  it('saves the page with real outputs and its figures kept, and tells the reader the code was run', async () => {
    const c = online();
    const model = fakeInference((r) => (r.task === 'folio_module_review' ? { issues: [] } : written));
    const saved: Uint8Array[] = [];
    const result = await generateSection(model, c, orderedLessons(c)[1]!.id, 'plan', undefined, { reviewer: model, run: { runner: fakeRunner(answers), saveFigure: async (png) => `media:m_${saved.push(png)}` } });
    const blocks = blocksOf(result.commands);
    expect(blocks.find((b) => b.type === 'code' && b.code === '12')).toBeTruthy();
    expect(blocks.find((b) => b.type === 'image')).toMatchObject({ src: 'media:m_1' });
    expect(saved).toHaveLength(1);
    expect(model.calls.find((r) => r.task === 'folio_module_review')!.prompt).toContain('holds what it really printed');
  });

  it('mends a cell that fails with its real error and runs the page again; with nowhere to keep a figure, leaves it out', async () => {
    const c = online();
    const broken = page([code('print(len(rows, 1))'), code('12', 'output'), code('rows.plot()')]);
    const mend = { parts: [{ number: 1, ...written.parts[0]! }], left: [] };
    const model = fakeInference((r) => (r.task === 'folio_module_review' ? { issues: [] } : r.task === 'folio_module_mend' ? mend : broken));
    const runner = fakeRunner({ ...answers, 'print(len(rows, 1))': { error: { type: 'TypeError', message: 'len() takes exactly one argument (2 given)', line: 1, traceback: '' } } });
    const result = await generateSection(model, c, orderedLessons(c)[1]!.id, 'plan', undefined, { reviewer: model, run: { runner } });
    expect(model.calls.map((r) => r.task)).toEqual(['folio_module', 'folio_module_review', 'folio_module_mend', 'folio_module_review']);
    expect(model.calls[2]!.prompt).toContain('TypeError: len() takes exactly one argument (2 given)');
    expect(result.flagged).toBe(0);
    expect(blocksOf(result.commands).find((b) => b.type === 'code' && b.code === '12')).toBeTruthy();
    expect(blocksOf(result.commands).some((b) => b.type === 'image')).toBe(false);
    expect(runner.ran).toEqual(['print(len(rows, 1))', 'rows.plot()', 'print(len(rows))', 'rows.plot()']);
  });

  it('keeps the page as written when the runner cannot be had', async () => {
    const c = online();
    const model = fakeInference((r) => (r.task === 'folio_module_review' ? { issues: [] } : written));
    const dead: Runner = { run: () => Promise.reject(new Error('no memory')), reset: () => Promise.reject(new Error('no memory')), versions: async () => ({}), close: () => undefined };
    const result = await generateSection(model, c, orderedLessons(c)[1]!.id, 'plan', undefined, { reviewer: model, run: { runner: dead } });
    expect(blocksOf(result.commands).find((b) => b.type === 'code' && b.code === '11')).toBeTruthy();
    expect(model.calls.find((r) => r.task === 'folio_module_review')!.prompt).toContain('run every piece of code in your head');
  });
});
