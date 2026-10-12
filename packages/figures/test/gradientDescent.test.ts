import { describeDescentStep, figureProblem, gradientDescent, gradientDescentTable, SlideVisualSchema, written } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { figureKind, paintSvg, stillFigure, type DescentPose } from '../src';

const fig = (values: number[], target = 1, look: 'cabinet' | 'flat' | 'composite' = 'composite') => ({ kind: 'figure' as const, figure: 'gradientDescent' as const, look, values, target });

describe('gradient descent, as a model', () => {
  it('moves w against the slope by the learning rate times the slope, on loss (w - best) squared', () => {
    const m = gradientDescent({ values: [4, 0.3, 5], target: 1 });
    expect(m.steps[0]).toMatchObject({ step: 1, w: 4, loss: 9, slope: 6 });
    expect(m.steps[0]!.move).toBeCloseTo(1.8);
    expect(m.steps[0]!.next).toBeCloseTo(2.2);
    expect(m.steps).toHaveLength(5);
    expect(m.course).toBe('downhill');
    expect(describeDescentStep(m, m.steps[0]!)).toBe('Step 1. At w = 4 the loss is 9 and the slope is 6. The step is 0.3 × 6 = 1.8, so w goes down to 2.2, where the loss is 1.44.');
  });

  it('says how the walk goes: down one side, across and closer, bouncing, or away', () => {
    const course = (rate: number) => gradientDescent({ values: [4, rate, 4], target: 1 }).course;
    expect([course(0.1), course(0.5), course(0.8), course(1), course(1.1)]).toEqual(['downhill', 'crossing', 'crossing', 'bouncing', 'diverging']);
    // At 0.5 one step lands on the lowest point; at 1 the loss never changes; over 1 it grows.
    expect(gradientDescent({ values: [4, 0.5, 2], target: 1 }).steps[0]!.next).toBe(1);
    const bounce = gradientDescent({ values: [4, 1, 3], target: 1 }).steps;
    expect(bounce.map((s) => s.loss)).toEqual([9, 9, 9]);
    const away = gradientDescent({ values: [4, 1.1, 3], target: 1 }).steps;
    expect(away[2]!.nextLoss).toBeGreaterThan(away[0]!.loss);
    expect(gradientDescent({ values: [1, 0.3, 2], target: 1 }).course).toBe('there');
  });

  it('writes a number exactly, or to three decimals and says so: never rounded without a word', () => {
    expect(written(1.44)).toEqual({ text: '1.44', exact: true });
    expect(written(0.2304)).toEqual({ text: '0.23', exact: false });
    const m = gradientDescent({ values: [4, 0.3, 5], target: 1 });
    expect(describeDescentStep(m, m.steps[1]!)).toContain('where the loss is about 0.23.');
    expect(gradientDescentTable(m).rows[1]).toEqual(['2', '2.2', '1.44', '2.4', '0.3 × 2.4 = 0.72', '1.48']);
    expect(gradientDescentTable(m).rows[2]![2]).toBe('≈ 0.23');
  });

  it('needs three numbers: a start, a learning rate above 0, and 1 to 8 whole steps', () => {
    expect(figureProblem(fig([4, 0.3, 5]))).toBeNull();
    for (const bad of [[4, 0.3], [4, 0, 5], [4, -1, 5], [4, 0.3, 0], [4, 0.3, 9], [4, 0.3, 2.5]]) expect(figureProblem(fig(bad)), String(bad)).toBe('badSetup');
    expect(figureProblem({ ...fig([4, 0.3, 5]), entered: { values: '4, fast, 5' } })).toBe('unfinished');
    expect(SlideVisualSchema.safeParse(fig([4, 0.3, 5])).success).toBe(true);
    expect(stillFigure(fig([4, 0, 5])).problem).toBe('badSetup');
  });
});

describe('gradient descent, drawn: a reading layer that is not a row', () => {
  const kind = figureKind(fig([4, 0.3, 5]));
  const stills = kind.stills(fig([4, 0.3, 5]));

  it('has a picture at the start, one before each step with the step it is about to take, and one at the end', () => {
    expect(stills.map((s) => s.kind)).toEqual(['start', 'step', 'step', 'step', 'step', 'step', 'end']);
    expect(stills[1]!.pose).toMatchObject({ w: 4, trail: [] });
    expect((stills[1]!.pose as DescentPose).to).toBeCloseTo(2.2);
    expect((stills[2]!.pose as DescentPose).trail).toEqual([4]);
    expect((stills.at(-1)!.pose as DescentPose).to).toBeNull();
  });

  it('writes w, the loss and the slope under their names, the step with its arithmetic, and a line from the puck to w', () => {
    const svg = kind.svg(fig([4, 0.3, 5]), stills[1]!);
    expect(svg).toContain('data-layer="scene"');
    expect(svg).toContain('data-part="leader"');
    expect(svg).toContain('data-part="step"');
    expect((svg.match(/data-part="readout"/g) ?? []).length).toBe(2);
    // The start has no step yet; the end has none left.
    expect(kind.svg(fig([4, 0.3, 5]), stills[0]!)).not.toContain('data-part="step"');
    expect(kind.svg(fig([4, 0.3, 5]), stills.at(-1)!)).not.toContain('data-part="step"');
  });

  it('holds a walk that runs away at the edge of the picture, and still draws it', () => {
    const away = fig([4, 1.3, 6]);
    const k2 = figureKind(away);
    for (const still of k2.stills(away)) expect(k2.svg(away, still)).toContain('data-part="compare"');
    expect(k2.limit(away)).toBeNull();
  });

  it('rolls the puck part of the way between two steps, and gives the strip where w has been', () => {
    const half = kind.between(stills[1]!.pose, stills[2]!.pose, 0.5) as DescentPose;
    expect(half.w).toBeCloseTo(3.1);
    expect(kind.items(fig([4, 0.3, 5]), stills[3]!.pose).map((x) => `${x.place}:${x.value}:${x.state}`)).toEqual(['1:4:past', '2:2.2:past', '3:1.48:now']);
  });

  it('is a still page and a PNG painted without a browser in each look', () => {
    for (const look of ['cabinet', 'flat', 'composite'] as const) {
      const still = stillFigure(fig([4, 0.3, 5], 1, look));
      expect(still.frames).toHaveLength(7);
      expect(still.table.rows).toHaveLength(5);
      const canvas = paintSvg(still.frames[1]!.svg!, 2);
      expect([canvas.width, canvas.height]).toEqual([still.width * 2, still.height * 2]);
    }
  });
});
