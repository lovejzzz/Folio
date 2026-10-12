import { after, describeResult, describeStart, describeStep, type BinarySearchModel } from '@folio/core';
import { sceneBody, sceneSvg, type DrawerState, type Pose, type Scene } from './binarySearchScene';
import { flatBody, flatSvg } from './flatScene';

/**
 * The search as a run of still pictures: where every part stands before the first comparison, at each comparison,
 * and at the end when the search runs out. Each is made from the model's own frame and carries the model's own
 * sentence, so the picture on a slide, the one in a Word file and the words under both are one account.
 */
export interface Keyframe {
  kind: 'start' | 'step' | 'end';
  /** The model's step this shows, counted from 1; 0 before the first. */
  step: number;
  pose: Pose;
  caption: string;
}

export function keyframes(model: BinarySearchModel): Keyframe[] {
  const n = model.values.length;
  const all = (state: DrawerState): DrawerState[] => model.values.map(() => state);
  const still = model.values.map(() => 0);
  const out: Keyframe[] = [{ kind: 'start', step: 0, pose: { lo: 0, hi: n, pull: still, state: all(n ? 'play' : 'aside') }, caption: describeStart(model) }];
  for (const frame of model.frames) {
    const found = frame.compare === 'equal';
    const state = model.values.map((_, i): DrawerState => (i === frame.mid ? (found ? 'found' : 'look') : i < frame.lo || i > frame.hi ? 'aside' : 'play'));
    const caption = found ? `${describeStep(model, frame)} ${describeResult(model)}` : describeStep(model, frame);
    out.push({ kind: 'step', step: frame.step, pose: { lo: frame.lo, hi: frame.hi + 1, pull: model.values.map((_, i) => (i === frame.mid ? 1 : 0)), state }, caption });
  }
  const last = model.frames.at(-1);
  // Found, the last comparison is the end. Run out, the fences have met and every drawer is set aside.
  if (last && model.found === null) {
    const left = after(last);
    out.push({ kind: 'end', step: last.step, pose: { lo: left.lo, hi: left.hi + 1, pull: still, state: all('aside') }, caption: describeResult(model) });
  }
  return out;
}

/** A pose part of the way from one keyframe to the next: fences and drawers on their way, states as they will be. */
export function between(from: Pose, to: Pose, t: number): Pose {
  const mix = (a: number, b: number) => a + (b - a) * t;
  return { lo: mix(from.lo, to.lo), hi: mix(from.hi, to.hi), pull: to.pull.map((p, i) => mix(from.pull[i] ?? 0, p)), state: t < 0.5 ? from.state : to.state };
}

/** One keyframe as a picture of its own (see `sceneSvg`): its caption is what a reader who cannot see it is told. */
export function renderFrame(model: BinarySearchModel, frame: Keyframe, look: FigureLook = 'cabinet'): string {
  const scene = { values: model.values, target: model.target, pose: frame.pose };
  return look === 'flat' ? flatSvg(scene, frame.caption) : sceneSvg(scene, frame.caption);
}

/** The looks a demonstration can be drawn in. */
export type FigureLook = 'cabinet' | 'flat';

/** The inside of the live SVG for a pose, in a look. */
export const figureBody = (scene: Scene, look: FigureLook): string => (look === 'flat' ? flatBody(scene) : sceneBody(scene));
