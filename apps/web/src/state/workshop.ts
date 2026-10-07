import type { RunOptions } from '@folio/ai';
import { localMediaRef } from '@folio/core';
import { RUNTIME_VERSION, type Runner } from '@folio/run';
import type { LineRunner } from '@folio/run/browser-r';
import { showFetching } from './live';
import { putMedia } from './media';

/**
 * The workshop: where the Python on a course's pages is run, in this browser, shut in a frame that can reach
 * nothing of Folio's. It is fetched and started only when a page with Python is written.
 */

/** Where R's files are: the one folder the R runner page's policy lets it reach. */
const R_RUNTIME = 'https://folio.university/api/runtime/webr-0.6.0/';

let made: Promise<Runner> | null = null;
/** Bytes of each file so far: the files arrive side by side. */
const arrived = new Map<string, number>();
const onDownload = (file: string, loaded: number): void => {
  arrived.set(file, loaded);
  showFetching([...arrived.values()].reduce((n, b) => n + b, 0));
};
const open = (): Promise<Runner> => (made ??= import('@folio/run/browser').then(({ browserRunner }) => browserRunner({ runnerUrl: '/runner/', runtimeUrl: `/api/runtime/pyodide-${RUNTIME_VERSION}/`, onDownload })));

/** The runner, there from the first cell on: until then nothing is loaded. */
const runner: Runner = {
  run: async (cell) => {
    const result = await (await open()).run(cell);
    // A cell has answered: whatever was being fetched for it is here.
    showFetching(null);
    return result;
  },
  reset: async () => (made ? (await made).reset() : undefined),
  versions: async () => (await open()).versions(),
  close: () => void made?.then((r) => r.close()),
};

/** A phone has too little memory to hold a Python with its libraries beside Folio: there a page is kept as written. */
const tooSmall = (): boolean => navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 600;

/** How a course's pages are run: figures the code draws are kept with the course's other pictures. */
export const pageRuns = (courseId: string): RunOptions | undefined => (tooSmall() ? undefined : runsFor(courseId));

/** R, for the code on a lesson's sheets: its page is opened only when a lesson with R is written. */
let madeR: Promise<LineRunner> | null = null;
const openR = (): Promise<LineRunner> => (madeR ??= import('@folio/run/browser-r').then(({ browserR }) => browserR({ runnerUrl: '/runner-r/', runtimeUrl: R_RUNTIME })));
const r: LineRunner = {
  fresh: async () => (await openR()).fresh(),
  run: async (line) => (await openR()).run(line),
  need: async (packages) => (await openR()).need(packages),
  close: () => void madeR?.then((x) => x.close()),
};

const runsFor = (courseId: string): RunOptions => ({
  runner,
  r,
  // Kept as written, and said where a developer looks: a teacher has nothing to do about it.
  onError: (error) => console.error('Folio could not run this page\u2019s code:', error),
  saveFigure: async (png) => localMediaRef(await putMedia(courseId, new Blob([png as BlobPart], { type: 'image/png' }), 'figure.png')),
});
