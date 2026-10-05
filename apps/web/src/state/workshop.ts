import type { RunOptions } from '@folio/ai';
import { localMediaRef } from '@folio/core';
import { RUNTIME_VERSION, type Runner } from '@folio/run';
import { putMedia } from './media';

/**
 * The workshop: where the Python on a course's pages is run, in this browser, shut in a frame that can reach
 * nothing of Folio's. It is fetched and started only when a page with Python is written.
 */

let made: Promise<Runner> | null = null;
const open = (): Promise<Runner> => (made ??= import('@folio/run/browser').then(({ browserRunner }) => browserRunner({ runnerUrl: '/runner/', runtimeUrl: `/api/runtime/pyodide-${RUNTIME_VERSION}/` })));

/** The runner, there from the first cell on: until then nothing is loaded. */
const runner: Runner = {
  run: async (cell) => (await open()).run(cell),
  reset: async () => (made ? (await made).reset() : undefined),
  versions: async () => (await open()).versions(),
  close: () => void made?.then((r) => r.close()),
};

/** A phone has too little memory to hold a Python with its libraries beside Folio: there a page is kept as written. */
const tooSmall = (): boolean => navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 600;

/** How a course's pages are run: figures the code draws are kept with the course's other pictures. */
export const pageRuns = (courseId: string): RunOptions | undefined => (tooSmall() ? undefined : runsFor(courseId));

const runsFor = (courseId: string): RunOptions => ({
  runner,
  saveFigure: async (png) => localMediaRef(await putMedia(courseId, new Blob([png as BlobPart], { type: 'image/png' }), 'figure.png')),
});
