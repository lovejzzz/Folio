import { binarySearchProblem, sortedForSearch, type SlideVisual } from '@folio/core';
import { Button } from '@folio/ui';
import { EditableText } from '../../components/editing/EditableText';
import { useT } from '../../i18n';

type Figure = Extract<SlideVisual, { kind: 'figure' }>;

/** A demonstration a teacher adds: a short sorted list with its target in the middle of the second half. */
export const newBinarySearch = (): Figure => ({ kind: 'figure', figure: 'binarySearch', values: [3, 8, 12, 17, 23, 31, 42, 56, 71], target: 42 });

/** What a teacher typed as a list of numbers: commas or spaces between them; what is no number is left out. */
const numbersIn = (text: string): number[] => text.split(/[\s,;，、]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));

/** The demonstration's numbers, under the slide where there is room for them: the figure is drawn from them again. */
export function FigureData({ v, onChange }: { v: Figure; onChange: (next: Figure) => void }) {
  const t = useT();
  const problem = binarySearchProblem(v);
  const target = (text: string) => {
    const n = Number(text.trim());
    if (text.trim() && Number.isFinite(n)) onChange({ ...v, target: n });
  };
  return (
    <div className="no-print mt-2 grid gap-1 font-ui text-12 text-ink-2" role="group" aria-label={t.figures.data}>
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-semibold">{t.figures.values}</span>
        <EditableText as="div" className="min-w-0 flex-1 border border-rule px-1.5 py-0.5 tabular-nums" value={v.values.join(', ')} label={t.figures.values} placeholder={t.figures.valuesHint} onCommit={(text) => onChange({ ...v, values: numbersIn(text) })} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-semibold">{t.figures.target}</span>
        <EditableText as="div" className="border border-rule px-1.5 py-0.5 tabular-nums" value={String(v.target)} label={t.figures.target} onCommit={target} />
      </div>
      {problem && (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-ink">
          {t.figures.problem[problem]}
          {problem === 'unsorted' && (
            <Button size="sm" variant="secondary" onPress={() => onChange({ ...v, values: sortedForSearch(v.values) })}>
              {t.figures.sort}
            </Button>
          )}
        </p>
      )}
    </div>
  );
}
