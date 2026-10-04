import { missingTargets, runBuild, targetKey, type BuildEvent, type BuildSummary, type BuildTarget, type Inference, type InferenceError, type SectionProgress, type Usage } from '@folio/ai';
import { attentionItems, cmd, lessonNumber, type GeneratedKind } from '@folio/core';
import { create } from 'zustand';
import { router } from '../app/router';
import { currentMessages } from '../i18n';
import { canReach, currentInference, currentReviewer, errorMessage } from './model';
import { activeStore, onSessionChange, setBuilding } from './session';
import { checkingRow, endRow, resetLive, reviewedRow, showPartial, startRow } from './live';
import { costSentence, takeUsage } from './spend';
import { toast } from './toasts';
import { useUi } from './ui';

export type CellRun = 'queued' | 'building' | 'error';

interface BuildState {
  courseId: string | null;
  running: boolean;
  stopping: boolean;
  total: number;
  done: number;
  /** In-flight or failed sections, keyed `${lessonId}:${kind}`. */
  cells: Record<string, CellRun>;
  errors: Record<string, string>;
  currentLesson: number;
  controller: AbortController | null;
}

export const useBuild = create<BuildState>(() => ({
  courseId: null,
  running: false,
  stopping: false,
  total: 0,
  done: 0,
  cells: {},
  errors: {},
  currentLesson: 0,
  controller: null,
}));

// Saves are gathered longer while a build runs, however it starts or ends.
useBuild.subscribe((state) => setBuilding(state.running));

function setCell(key: string, state: CellRun | null, error?: string): void {
  const { cells, errors } = useBuild.getState();
  const nextCells = { ...cells };
  const nextErrors = { ...errors };
  if (state) nextCells[key] = state;
  else delete nextCells[key];
  if (error) nextErrors[key] = error;
  else delete nextErrors[key];
  useBuild.setState({ cells: nextCells, errors: nextErrors });
}

export function cellRun(lessonId: string, kind: GeneratedKind): CellRun | undefined {
  return useBuild.getState().cells[`${lessonId}:${kind}`];
}

/** `cost` is a sentence on what the run cost, or ''. */
function finishToast(summary: Awaited<ReturnType<typeof runBuild>>, cost: string): void {
  const t = currentMessages();
  const withCost = (message: string) => (cost ? `${message}${t.common.sentenceGap}${cost}` : message);
  const store = activeStore();
  const openChanges = { label: t.build.review, run: () => useUi.getState().openDrawer('changes') };
  if (summary.fatal && summary.fatal.kind !== 'aborted') {
    const fixable = summary.fatal.kind === 'auth' || summary.fatal.kind === 'config';
    // A key problem is fixed in the connect dialog, and the build picks up where it stopped.
    const fixKey = { label: t.build.fixKey, run: () => useUi.getState().requireModel(() => void startBuild()) };
    // Out of credits: the packs, and Resume picks up where the build stopped once there are more.
    const addCredits = { label: t.build.addCredits, run: () => void router.navigate({ to: '/settings', hash: 'credits' }) };
    const action = fixable ? fixKey : summary.fatal.kind === 'credits' ? addCredits : undefined;
    toast({ key: 'build', message: errorMessage(summary.fatal), tone: 'critical', duration: 0, action });
  } else if (summary.stopped && switchedFrom) {
    toast({ key: 'build', message: withCost(t.build.stoppedBySwitch(switchedFrom)) });
  } else if (summary.stopped) {
    toast({ key: 'build', message: withCost(t.build.stopped) });
  } else if (summary.failed) {
    const looks = store ? attentionItems(store.getState()).length : 0;
    // When every failure had one cause (a rate limit, the network), the toast says what it was.
    const causes = new Set(Object.values(useBuild.getState().errors).filter(Boolean));
    const cause = causes.size === 1 ? [...causes][0]! : '';
    const failed = cause ? `${t.build.failedSome(summary.failed)}${t.common.sentenceGap}${cause}` : t.build.failedSome(summary.failed);
    const message = looks ? `${failed}${t.common.sentenceGap}${t.build.looksToo(looks)}` : failed;
    toast({ key: 'build', message: withCost(message), tone: 'attention', action: openChanges, duration: 0 });
  } else {
    const looks = store ? attentionItems(store.getState()).length : 0;
    // Ready is where the teacher's work starts: the toast offers the first lesson to read through.
    const course = store?.getState();
    const lessonId = course?.lessonOrder[0];
    const openFirst = course && lessonId ? { label: t.build.openFirst, run: () => void router.navigate({ to: '/c/$courseId/lesson/$lessonId', params: { courseId: course.id, lessonId } }) } : undefined;
    toast({ key: 'build', message: withCost(looks ? t.build.readyLook(looks) : t.build.ready), action: looks ? openChanges : openFirst, duration: 12_000 });
  }
}

/** Title of the course whose build stopped because another course was opened. */
let switchedFrom: string | null = null;
let buildingTitle = '';

// A build belongs to the course it started in: opening another one stops it,
// rather than spending calls on results that could no longer be saved.
onSessionChange(() => {
  const { running, courseId } = useBuild.getState();
  if (!running || activeStore()?.getState().id === courseId) return;
  switchedFrom = buildingTitle;
  stopBuild();
});

/** Queue these targets; failures from an earlier run of this course stay marked until retried. */
function queuedCells(courseId: string, list: BuildTarget[]): Pick<BuildState, 'cells' | 'errors'> {
  const earlier = useBuild.getState().courseId === courseId ? useBuild.getState() : { cells: {}, errors: {} };
  const cells: Record<string, CellRun> = { ...earlier.cells };
  const errors: Record<string, string> = { ...earlier.errors };
  for (const target of list) {
    cells[targetKey(target)] = 'queued';
    delete errors[targetKey(target)];
  }
  return { cells, errors };
}

type Store = NonNullable<ReturnType<typeof activeStore>>;

function markReady(store: Store): void {
  if (store.getState().status === 'ready') return;
  store.apply([cmd('course.update', { status: 'ready' })], { label: { key: 'editedCourse' }, source: 'ai', silent: true });
}

function trackEvent(store: Store, event: BuildEvent): void {
  const key = targetKey(event.target);
  if (event.type === 'start') {
    setCell(key, 'building');
    startRow(event.target.lessonId, event.target.kind);
    useBuild.setState({ currentLesson: lessonNumber(store.getState(), event.target.lessonId) });
  } else if (event.type === 'done') {
    setCell(key, null);
    endRow(key, 'done');
    useBuild.setState({ done: useBuild.getState().done + 1 });
  } else {
    setCell(key, (event.error as InferenceError).kind === 'aborted' ? null : 'error', errorMessage(event.error));
    endRow(key, 'failed');
    useBuild.setState({ done: useBuild.getState().done + 1 });
  }
}

/** Show a section taking shape: its answer so far, and its plan being checked. */
function trackProgress(target: BuildTarget, progress: SectionProgress): void {
  const key = targetKey(target);
  if (progress.type === 'partial') showPartial(key, progress.value);
  else if (progress.type === 'checking') checkingRow(key);
  else if (progress.type === 'reviewed') reviewedRow(key, progress.fixes, progress.notes);
}

/** Run the build; anything no part of it expected ends it, and it can be started again. */
async function guardedRun(store: Store, inference: Inference, usages: Usage[], controller: AbortController, list: BuildTarget[]): Promise<BuildSummary | null> {
  try {
    return await runBuild(
      {
        inference,
        reviewer: currentReviewer((u) => usages.push(u)) ?? undefined,
        getCourse: store.getState,
        signal: controller.signal,
        commit: (target, commands) => {
          const n = lessonNumber(store.getState(), target.lessonId);
          store.apply(commands, { label: { key: 'built', values: { kind: target.kind, n } }, source: 'ai', undoable: false });
        },
        onEvent: (event) => trackEvent(store, event),
        onProgress: trackProgress,
      },
      list,
    );
  } catch (error) {
    useBuild.setState({ running: false, stopping: false, controller: null, cells: {} });
    toast({ key: 'build', message: errorMessage(error), tone: 'critical', duration: 0 });
    return null;
  }
}

/**
 * Build sections for the open course. With no targets, builds everything
 * missing; a course whose materials are all course-level (the syllabus, the
 * map) has nothing to write per lesson and is ready straight away.
 */
export async function startBuild(targets?: BuildTarget[]): Promise<void> {
  const store = activeStore();
  if (!store || useBuild.getState().running) return;
  const course = store.getState();
  const list = targets ?? missingTargets(course);
  if (!list.length) {
    if (!targets && course.status !== 'ready') {
      markReady(store);
      toast({ key: 'build', message: currentMessages().build.ready, duration: 6000 });
    }
    return;
  }
  // Every call's tokens, the outline's included, so the run can say what it cost.
  const usages: Usage[] = [];
  const inference = currentInference((u) => usages.push(u));
  if (!inference) {
    useUi.getState().requireModel(() => void startBuild(targets));
    return;
  }
  if (!canReach(inference)) return;
  usages.push(...takeUsage(course.id));
  const controller = new AbortController();
  const { cells, errors } = queuedCells(course.id, list);
  switchedFrom = null;
  buildingTitle = course.title;
  resetLive();
  useBuild.setState({ courseId: course.id, running: true, stopping: false, total: list.length, done: 0, cells, errors, controller });
  if (course.status !== 'building') {
    store.apply([cmd('course.update', { status: 'building' })], { label: { key: 'editedCourse' }, source: 'ai', silent: true });
  }
  const summary = await guardedRun(store, inference, usages, controller, list);
  if (!summary) return;
  if (!missingTargets(store.getState()).length) markReady(store);
  const { cells: after } = useBuild.getState();
  const errorsOnly = Object.fromEntries(Object.entries(after).filter(([, v]) => v === 'error'));
  useBuild.setState({ running: false, stopping: false, controller: null, cells: errorsOnly });
  // A key problem says only what to fix; otherwise the teacher hears what the run cost.
  const cost = summary.fatal && summary.fatal.kind !== 'aborted' ? '' : await costSentence(usages).catch(() => '');
  // Paid with Folio credits: the balance shown anywhere catches up with what the build used.
  if (usages.some((u) => u.provider === 'folio')) void import('./credits').then((m) => m.refreshCredits());
  finishToast(summary, cost);
  switchedFrom = null;
}

/**
 * Whether a build can start from the plan screen. Offline, a build that needs
 * a cloud model says so and the teacher stays on the plan, rather than landing
 * on a map that can't fill in.
 */
export function readyToBuild(): boolean {
  const store = activeStore();
  if (!store) return false;
  if (!missingTargets(store.getState()).length) return true;
  const inference = currentInference();
  return !inference || canReach(inference);
}

export function stopBuild(): void {
  const { controller } = useBuild.getState();
  if (!controller) return;
  useBuild.setState({ stopping: true });
  controller.abort();
}

export function retryCell(lessonId: string, kind: GeneratedKind): void {
  void startBuild([{ lessonId, kind }]);
}
