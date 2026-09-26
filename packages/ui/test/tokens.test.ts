import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { color, tab, type Pair } from '../src/tokens';
import { renderTokens } from '../src/tokensCss';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const modes = ['light', 'dark'] as const;
const surfaces: (keyof typeof color)[] = ['paper', 'desk', 'well', 'accent-tint'];

describe('token contrast (WCAG 2.2 AA)', () => {
  const text: (keyof typeof color)[] = ['ink', 'ink-2', 'accent', 'good', 'attention', 'critical'];
  for (const mode of modes) {
    for (const fg of text) {
      for (const bg of surfaces) {
        it(`${fg} on ${bg} (${mode}) is at least 4.5:1`, () => {
          expect(contrast((color[fg] as Pair)[mode], (color[bg] as Pair)[mode])).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
    it(`ink-3 is at least 3:1 for large text (${mode})`, () => {
      expect(contrast(color['ink-3'][mode], color.paper[mode])).toBeGreaterThanOrEqual(3);
    });
    it(`accent-ink on accent is at least 4.5:1 (${mode})`, () => {
      expect(contrast(color['accent-ink'][mode], color.accent[mode])).toBeGreaterThanOrEqual(4.5);
    });
    it(`status text on its tint is at least 4.5:1 (${mode})`, () => {
      expect(contrast(color.attention[mode], color['attention-tint'][mode])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color.critical[mode], color['critical-tint'][mode])).toBeGreaterThanOrEqual(4.5);
    });
    it(`binder tabs reach 3:1 as UI marks (${mode})`, () => {
      for (const [kind, pair] of Object.entries(tab)) {
        expect(contrast(pair[mode], color.paper[mode]), kind).toBeGreaterThanOrEqual(3);
      }
    });
    it(`control boundaries reach 3:1 (${mode})`, () => {
      expect(contrast(color.field[mode], color.paper[mode])).toBeGreaterThanOrEqual(3);
      expect(contrast(color.field[mode], color.well[mode])).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('tokens.css', () => {
  it('is generated from tokens.ts', () => {
    const file = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');
    expect(file).toBe(renderTokens());
  });
});
