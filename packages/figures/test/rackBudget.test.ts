import { describeRackStep, figureProblem, rackBudget, rackBudgetTable } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { figureKind, paintSvg, stillFigure, type RackPose } from '../src';

const fig = (values: number[], look: 'cabinet' | 'flat' | 'composite' = 'composite') => ({ kind: 'figure' as const, figure: 'rackBudget' as const, look, values, target: 0 });

describe('filling a rack against a budget, as a model', () => {
  it('puts servers in until the next would go over the budget, and says the budget stopped it', () => {
    const m = rackBudget({ values: [10.2, 40, 6] });
    expect(m.steps.map((s) => [s.total, s.fits])).toEqual([[10.2, true], [20.4, true], [30.6, true], [40.8, false]]);
    expect(m).toMatchObject({ fitted: 3, stoppedBy: 'budget' });
    expect(describeRackStep(m, m.steps[3]!)).toBe('The fourth server would bring it to 4 × 10.2 = 40.8, over the budget of 40 by 0.8: it does not go in.');
    expect(rackBudgetTable(m).rows[2]).toEqual(['3', '3 × 10.2 = 30.6', '40', 'yes, 9.4 left']);
  });

  it('says when the room stopped it, when both did, and when not one fits', () => {
    expect(rackBudget({ values: [5, 40, 4] })).toMatchObject({ fitted: 4, stoppedBy: 'slots' });
    expect(rackBudget({ values: [10, 40, 4] })).toMatchObject({ fitted: 4, stoppedBy: 'both' });
    expect(rackBudget({ values: [50, 40, 4] })).toMatchObject({ fitted: 0, stoppedBy: 'budget' });
    // Decimals that add to the budget exactly fit: 0.1 three times is 0.3.
    expect(rackBudget({ values: [0.1, 0.3, 5] }).fitted).toBe(3);
  });

  it('needs what one takes, a budget, and 1 to 8 slots', () => {
    expect(figureProblem(fig([10.2, 40, 6]))).toBeNull();
    for (const bad of [[10.2, 40], [0, 40, 6], [10, 0, 6], [10, 40, 0], [10, 40, 9], [10, 40, 2.5]]) expect(figureProblem(fig(bad)), String(bad)).toBe('badSetup');
  });
});

describe('filling a rack, drawn: a gauge for a reading', () => {
  const v = fig([10.2, 40, 6]);
  const kind = figureKind(v);
  const stills = kind.stills(v);
  const layer = (svg: string, name: string) => svg.split(`data-layer="${name}"`)[1]!.split('data-layer=')[0]!;
  const states = (text: string) => [...text.matchAll(/data-drawer="(\d+)" data-state="(\w+)"/g)].map((m) => `${m[1]}:${m[2]}`);

  it('has a picture before any server, one for each tried, and one at the end', () => {
    expect(stills.map((s) => s.kind)).toEqual(['start', 'step', 'step', 'step', 'step', 'end']);
    expect((stills[3]!.pose as RackPose).state).toEqual(['in', 'in', 'now', 'waiting']);
    expect((stills[4]!.pose as RackPose).state).toEqual(['in', 'in', 'in', 'refused']);
    expect((stills[4]!.pose as RackPose).out[3]).toBeGreaterThan(0);
  });

  it('shows each server tried in both layers in the same state, the one that does not fit across the budget line', () => {
    for (const still of stills) {
      const svg = kind.svg(v, still);
      expect(states(layer(svg, 'scene'))).toEqual(states(layer(svg, 'reading')));
      expect(svg.includes('data-part="leader"')).toBe(still.kind === 'step');
    }
    expect(kind.svg(v, stills[4]!)).toContain('data-state="refused"');
    expect(kind.items(v, stills[4]!.pose).map((x) => `${x.place}:${x.value}:${x.state}`)).toEqual(['1:10.2:in', '2:20.4:in', '3:30.6:in', '4:40.8:refused']);
  });

  it('slides a server part of the way in, and is a still page and a PNG in each look', () => {
    const half = kind.between(stills[0]!.pose, stills[1]!.pose, 0.5) as RackPose;
    expect(half.out[0]).toBeGreaterThan(0);
    expect(half.out[0]).toBeLessThan(1.7);
    for (const look of ['cabinet', 'flat', 'composite'] as const) {
      const still = stillFigure(fig([10.2, 40, 6], look));
      expect(still.frames).toHaveLength(6);
      const canvas = paintSvg(still.frames[2]!.svg!, 2);
      expect([canvas.width, canvas.height]).toEqual([still.width * 2, still.height * 2]);
    }
  });
});
