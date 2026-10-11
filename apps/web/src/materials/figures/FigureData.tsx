import { binarySearchProblem, sortedForSearch, type SlideVisual } from '@folio/core';
import { Button } from '@folio/ui';
import { useState } from 'react';
import { EditableText } from '../../components/editing/EditableText';
import { useT } from '../../i18n';

type Figure = Extract<SlideVisual, { kind: 'figure' }>;

/** A demonstration a teacher adds: a short sorted list with its target in the middle of the second half. */
export const newBinarySearch = (): Figure => ({ kind: 'figure', figure: 'binarySearch', values: [3, 8, 12, 17, 23, 31, 42, 56, 71], target: 42 });

/** What a teacher typed as a list, entry by entry: commas, semicolons or spaces between them. */
const entries = (text: string): string[] => text.split(/[\s,;，、]+/).filter(Boolean);
const isNumber = (entry: string): boolean => entry.trim() !== '' && Number.isFinite(Number(entry));

/**
 * The demonstration's numbers, under the slide where there is room for them: the figure is drawn from them again.
 * What is typed and is not a number stays as typed, with the entries at fault named: "1, nope, 3" had become "1, 3"
 * without a word, and a teacher's list is not Folio's to shorten.
 */
export function FigureData({ v, onChange }: { v: Figure; onChange: (next: Figure) => void }) {
  const t = useT();
  const [list, setList] = useState<string | null>(null);
  const [sought, setSought] = useState<string | null>(null);
  const problem = binarySearchProblem(v);
  const wrong = [...entries(list ?? ''), ...(sought === null ? [] : [sought.trim()])].filter((x) => !isNumber(x));
  const values = (text: string) => {
    const given = entries(text);
    if (!given.every(isNumber)) return setList(text);
    setList(null);
    onChange({ ...v, values: given.map(Number) });
  };
  const target = (text: string) => {
    if (!isNumber(text)) return setSought(text);
    setSought(null);
    onChange({ ...v, target: Number(text) });
  };
  return (
    <div className="no-print mt-2 grid gap-1 font-ui text-12 text-ink-2" role="group" aria-label={t.figures.data}>
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-semibold">{t.figures.values}</span>
        <EditableText as="div" className="min-w-0 flex-1 border border-rule px-1.5 py-0.5 tabular-nums" value={list ?? v.values.join(', ')} label={t.figures.values} placeholder={t.figures.valuesHint} onCommit={values} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-semibold">{t.figures.target}</span>
        <EditableText as="div" className="border border-rule px-1.5 py-0.5 tabular-nums" value={sought ?? String(v.target)} label={t.figures.target} onCommit={target} />
      </div>
      {wrong.length > 0 && (
        <p role="alert" className="text-ink">
          {t.figures.notNumber(wrong)}
        </p>
      )}
      {wrong.length === 0 && problem && (
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
