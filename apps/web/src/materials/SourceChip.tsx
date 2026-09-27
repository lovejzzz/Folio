import { passageText, type Course, type SourceRef } from '@folio/core';
import { Tooltip } from '@folio/ui';
import { BookMarked } from 'lucide-react';
import { Button } from 'react-aria-components';
import { useT } from '../i18n';
import { useUi } from '../state/ui';

/** An inline citation: the source's name; the passage on hover or focus; Sources on click. */
export function SourceChip({ course, refs }: { course: Course; refs: SourceRef[] }) {
  const t = useT();
  const cited = refs.flatMap((r) => {
    const source = course.sources[r.sourceId];
    return source ? [{ key: `${r.sourceId}:${r.passageId}`, title: source.title, text: passageText(source, r.passageId) }] : [];
  });
  return (
    <>
      {cited.map((c) => (
        <Tooltip key={c.key} delay={200} content={<span className="block max-w-xs whitespace-pre-line leading-5">{c.text.slice(0, 280)}</span>}>
          <Button
            aria-label={t.common.labelled(t.quiz.source, c.title)}
            onPress={() => useUi.getState().openDrawer('sources')}
            className="inline-flex h-6 max-w-48 items-center gap-1 rounded-full bg-well px-2 font-ui text-12 text-ink-2 outline-none data-hovered:text-ink data-focus-visible:ring-2 data-focus-visible:ring-accent"
          >
            <BookMarked size={12} strokeWidth={1.75} aria-hidden />
            <span className="truncate">{c.title}</span>
          </Button>
        </Tooltip>
      ))}
    </>
  );
}
