import { describe, expect, it } from 'vitest';
import { createSource, passageText } from '../src/sources';

const para = (n: number) => `Paragraph ${n}. ` + 'Plants take in carbon dioxide through the stomata on the underside of their leaves. '.repeat(3);

describe('source passages', () => {
  it('keeps full paragraphs as their own passages', () => {
    const s = createSource('Notes', [para(1), para(2), para(3)].join('\n\n'));
    expect(s.passages).toHaveLength(3);
    expect(passageText(s, s.passages[1]!.id)).toBe(para(2).trim());
  });

  it('joins a heading to the paragraph it introduces', () => {
    const s = createSource('Notes', `# Leaf notes\n\n${para(1)}\n\n${para(2)}`);
    expect(s.passages).toHaveLength(2);
    expect(passageText(s, s.passages[0]!.id)).toMatch(/^# Leaf notes\n\nParagraph 1/);
  });

  it('groups many short lines (a Word table) into a few passages, not hundreds', () => {
    const cells = Array.from({ length: 400 }, (_, i) => `Cell ${i}`).join('\n\n');
    const s = createSource('Table', cells);
    expect(s.passages.length).toBeLessThan(40);
    const covered = s.passages.map((p) => s.text.slice(p.start, p.end)).join('\n\n');
    expect(covered).toBe(s.text);
  });

  it('never makes a passage longer than the cap by merging', () => {
    const s = createSource('Mixed', ['Short.', 'x'.repeat(1190), 'Also short.'].join('\n\n'));
    for (const p of s.passages) expect(p.end - p.start).toBeLessThanOrEqual(1200 + 1190);
    expect(s.passages.map((p) => s.text.slice(p.start, p.end)).join('\n\n')).toBe(s.text);
  });

  it('handles a single short text', () => {
    expect(createSource('One', 'Just one line.').passages).toHaveLength(1);
    expect(createSource('None', '   ').passages).toHaveLength(0);
  });
});
