import { figureProblem, type SlideVisual } from '@folio/core';
import type { SlidesDraft } from './schemas';

type SlideDraft = SlidesDraft['slides'][number];

/** A slide's notes, or, left empty, the plan's own words for its segment: 41 slides of 254 had none, 30 of them activity slides, and a teacher presenting from the deck had nothing to say. */
export const notedFrom = (notes: string, segment?: { description: string }): string => notes.trim() || (segment?.description ?? '');

/** A slide's table or chart as the deck keeps it: rows as long as their headings, a value for every category, or nothing at all. */
export function slideVisual(table: SlideDraft['table'], chart: SlideDraft['chart'], steps?: SlideDraft['steps'], compare?: SlideDraft['compare'], figure?: SlideDraft['figure']): { visual?: SlideVisual } {
  // A demonstration is kept only when its numbers are ones its method can work: an unsorted list for a search, or a rate of 0, is dropped, never drawn wrong.
  if (figure && !figureProblem(figure)) return { visual: { kind: 'figure', look: 'composite', ...figure } };
  const named = steps?.steps.filter((x) => x.title.trim()) ?? []; // two named at the least, of a chain as of things side by side
  if (named.length >= 2) return { visual: { kind: 'steps', steps: named, cycle: steps!.cycle } };
  const sides = compare?.sides.filter((x) => x.title.trim()) ?? [];
  if (sides.length >= 2) return { visual: { kind: 'compare', sides, ask: compare!.ask } };
  // The draft is taken loosely, so one odd chart does not cost the deck; only a sound one is kept.
  if (chart && chart.categories.length >= 2 && chart.series.length >= 1 && chart.series.every((x) => x.values.length === chart.categories.length)) return { visual: { kind: 'chart', ...chart, series: chart.series as [typeof chart.series[number]] } };
  if (table && table.columns.length >= 2 && table.rows.length) return { visual: { kind: 'table', columns: table.columns, rows: table.rows.map((r) => table.columns.map((_, i) => r[i] ?? '')) } };
  return {};
}


/**
 * Each slide with one visual. A slide holds one, and a draft that gave two kept only the first in the order above: a
 * composition lesson's "How this course works" kept its chain of draft, review and revision and lost the table of
 * grade shares the pairs then worked from. A second or third visual goes on a slide of its own right after, in the
 * same segment, so nothing the plan shows is lost.
 */
export function oneVisualEach(slides: SlideDraft[]): SlideDraft[] {
  return slides.flatMap((s) => {
    const parts = ([{ figure: s.figure }, { steps: s.steps }, { compare: s.compare }, { chart: s.chart }, { table: s.table }] as Partial<SlideDraft>[]).filter((p) => slideVisual(p.table, p.chart, p.steps, p.compare, p.figure).visual);
    if (parts.length <= 1) return [s];
    const { table: _t, chart: _c, steps: _s, compare: _m, figure: _f, ...bare } = s;
    return parts.map((p, i) => (i === 0 ? { ...bare, ...p } : { ...bare, layout: 'bullets' as const, title: `${s.title} (continued)`, bullets: [], notes: '', ...p }));
  });
}
