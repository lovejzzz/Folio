import { missingTargets, runBuild, targetKey, type BuildTarget, type InferenceError } from '@folio/ai';
import { attentionItems, cmd, lessonNumber, type GeneratedKind } from '@folio/core';
import { create } from 'zustand';
import { currentMessages } from '../i18n';
import { currentInference, errorMessage } from './model';
import { activeStore } from './session';
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

function finishToast(summary: Awaited<ReturnType<typeof runBuild>>): void {
  const t = currentMessages();
  const store = activeStore();
  const openChanges = { label: t.build.review, run: () => useUi.getState().openDrawer('changes') };
  if (summary.fatal && summary.fatal.kind !== 'aborted') {
    toast({ key: 'build', message: errorMessage(summary.fatal), tone: 'critical', duration: 0 });
  } else if (summary.stopped) {
    toast({ key: 'build', message: t.build.stopped });
  } else if (summary.failed) {
    toast({ key: 'build', message: t.build.failedSome(summary.failed), tone: 'attention', action: openChanges, duration: 0 });
  } else {
    const looks = store ? attentionItems(store.getState()).length : 0;
    toast({ key: 'build', message: looks ? t.build.readyLook(looks) : t.build.ready, action: looks ? openChanges : undefined, duration: looks ? 12_000 : 6000 });
  }
}

/** Build sections for the open course. With no targets, builds everything missing. */
export async function startBuild(targets?: BuildTarget[]): Promise<void> {
  const store = activeStore();
  if (!store || useBuild.getState().running) return;
  const inference = currentInference();
  if (!inference) {
    useUi.getState().requireModel(() => void startBuild(targets));
    return;
  }
  const course = store.getState();
  const list = targets ?? missingTargets(course);
  if (!list.length) return;
  const controller = new AbortController();
  const cells: Record<string, CellRun> = {};
  for (const target of list) cells[targetKey(target)] = 'queued';
  useBuild.setState({ courseId: course.id, running: true, stopping: false, total: list.length, done: 0, cells, errors: {}, controller });
  if (course.status !== 'building') {
    store.apply([cmd('course.update', { status: 'building' })], { label: { key: 'editedCourse' }, source: 'ai', silent: true });
  }
  const summary = await runBuild(
    {
      inference,
      getCourse: store.getState,
      signal: controller.signal,
      commit: (target, commands) => {
        const n = lessonNumber(store.getState(), target.lessonId);
        store.apply(commands, {
          label: { key: 'built', values: { kind: target.kind, n } },
          source: 'ai',
          undoable: false,
        });
      },
      onEvent: (event) => {
        const key = targetKey(event.target);
        if (event.type === 'start') {
          setCell(key, 'building');
          useBuild.setState({ currentLesson: lessonNumber(store.getState(), event.target.lessonId) });
        } else if (event.type === 'done') {
          setCell(key, null);
          useBuild.setState({ done: useBuild.getState().done + 1 });
        } else {
          setCell(key, (event.error as InferenceError).kind === 'aborted' ? null : 'error', errorMessage(event.error));
          useBuild.setState({ done: useBuild.getState().done + 1 });
        }
      },
    },
    list,
  );
  const stillMissing = missingTargets(store.getState()).length;
  if (!stillMissing) {
    store.apply([cmd('course.update', { status: 'ready' })], { label: { key: 'editedCourse' }, source: 'ai', silent: true });
  }
  const { cells: after } = useBuild.getState();
  const errorsOnly = Object.fromEntries(Object.entries(after).filter(([, v]) => v === 'error'));
  useBuild.setState({ running: false, stopping: false, controller: null, cells: errorsOnly });
  finishToast(summary);
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
