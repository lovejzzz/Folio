import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { version } from 'pyodide';
import { cleanResult, LIMITS, RUNTIME_VERSION } from '../src';
import { nodeRunner, RUNTIME_DIR } from '../src/node';

describe('a notebook run in Node', () => {
  it('keeps names from cell to cell, returns what is printed and the last value, and forgets on reset', async () => {
    const runner = nodeRunner();
    expect(await runner.run({ code: 'x = 6\nprint("six")' })).toMatchObject({ stdout: 'six\n', value: null, error: null });
    expect(await runner.run({ code: 'x * 7' })).toMatchObject({ stdout: '', value: '42' });
    await runner.reset();
    expect((await runner.run({ code: 'x' })).error).toMatchObject({ type: 'NameError', line: 1 });
    expect((await runner.versions()).python).toMatch(/^3\.\d+/);
  }, 60_000);

  it('reports an error with the line of the cell, after what was printed before it', async () => {
    const runner = nodeRunner();
    const res = await runner.run({ code: 'print("before")\nvalues = [1, 2]\nvalues[5]' });
    expect(res.stdout).toBe('before\n');
    expect(res.error).toMatchObject({ type: 'IndexError', line: 3 });
    expect(res.error?.traceback).not.toContain('<folio>');
    expect((await runner.run({ code: 'def f(:\n  pass' })).error).toMatchObject({ type: 'SyntaxError', line: 1 });
  }, 60_000);

  it('reads the input a cell is given, fails cleanly without any, and reads the files it is handed', async () => {
    const runner = nodeRunner();
    expect((await runner.run({ code: 'print(input("Name? ") + "!")', stdin: 'Ada\n' })).stdout).toBe('Name? Ada!\n');
    expect((await runner.run({ code: 'input()' })).error?.type).toBe('EOFError');
    const res = await runner.run({ code: 'print(open("data/scores.csv").read().count(","))', files: [{ path: 'data/scores.csv', data: 'a,b\n1,2\n' }] });
    expect(res.stdout).toBe('2\n');
  }, 60_000);

  it('cuts output at the limit and says so', async () => {
    const runner = nodeRunner({ ...LIMITS, maxOut: 100 });
    const res = await runner.run({ code: 'print("x" * 1000)' });
    expect(res.stdout).toHaveLength(100);
    expect(res.cut).toBe(true);
  }, 60_000);
});

it('names the version of the interpreter that is installed', () => expect(RUNTIME_VERSION).toBe(version));

describe('a result from the runner', () => {
  it('is rebuilt from known fields: a figure that is not a PNG is dropped, extra fields are gone', () => {
    const png = (width: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, width >> 8, width & 255, 0, 0, 0, 10, 8, 6, 0, 0, 0]);
    // The second says it is 60,000 pixels wide; the third is an SVG; the fourth is not a figure at all.
    const res = cleanResult({ stdout: 'ok', value: 7, extra: '<script>', error: { type: 'E', message: 5 }, figures: [{ png: png(800) }, { png: png(60000) }, { png: new Uint8Array([60, 115, 118, 103]) }, 'x'] });
    expect(res).toMatchObject({ stdout: 'ok', value: null, error: { type: 'E', message: '' }, figuresDropped: 3 });
    expect(res?.figures).toHaveLength(1);
    expect(res).not.toHaveProperty('extra');
    expect(cleanResult('nope')).toBeNull();
  });
});

// The libraries are a download of tens of megabytes: these run where `scripts/fetch-runtime.ts` has been run.
describe.skipIf(!existsSync(join(RUNTIME_DIR, 'pyodide-lock.json')))('a notebook with the libraries', () => {
  it('adds past two billion as a teacher\'s computer does, though this Python is 32-bit', async () => {
    const runner = nodeRunner();
    const run = async (code: string) => (await runner.run({ code })).stdout || (await runner.run({ code })).error?.traceback;
    expect(await run('import numpy as np\nprint((np.arange(100000)**2).sum(), np.prod(np.arange(1, 15)), np.cumsum(np.full(3, 2**30))[-1], np.zeros(2, dtype=int).dtype)')).toBe('333328333350000 87178291200 3221225472 int64\n');
    // What the code asked for is kept, and an array looks as it does on 64 bits: no dtype for the default.
    expect(await run('x = np.array([0, 1, 1, 3])\nprint(np.array([1, 2], dtype="int32").dtype, np.array([1.5]).dtype, repr(x), repr(np.argsort(x)))')).toBe('int32 float64 array([0, 1, 1, 3]) array([0, 1, 2, 3])\n');
    // Libraries still count in their own size, and the course's wide counts are taken back where they must fit.
    expect(await run('from scipy import stats\nprint(np.bincount(x), np.repeat(np.array(["a", "b"]), np.array([2, 1])), stats.rankdata(np.array([3, 1, 2])))')).toBe("[1 2 0 1] ['a' 'a' 'b'] [3. 1. 2.]\n");
  }, 120_000);

  it('returns a figure left open as a PNG, and shows a wide table as a notebook does', async () => {
    const runner = nodeRunner();
    const res = await runner.run({ code: 'import pandas as pd, matplotlib.pyplot as plt\ndf = pd.DataFrame({f"c{i}": [i] for i in range(18)})\nprint(df)\ndf.T.plot()\nplt.show()' });
    expect(res.error).toBeNull();
    expect(res.stdout).toContain('c17');
    expect(res.stdout).not.toContain('...');
    expect(res.figures).toHaveLength(1);
    expect(res.figures[0]!.png.byteLength).toBeGreaterThan(2000);
    expect(await runner.versions()).toMatchObject({ pandas: '3.0.2', numpy: '2.4.6' });
  }, 120_000);
});
