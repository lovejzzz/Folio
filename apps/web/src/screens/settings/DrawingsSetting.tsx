import { Switch, Tooltip } from '@folio/ui';
import { Info } from 'lucide-react';
import { Button } from 'react-aria-components';
import { drawText } from '../../i18n/drawText';
import { usePrefs } from '../../state/prefs';

const t = drawText.setting;

/** What a drawn slide looks like, shown in the tooltip: a slide's table of three life cycles, and the same drawn. */
function Demo() {
  return (
    <span className="block w-72 py-1 leading-5">
      <img className="block w-full rounded-control bg-paper" src="/drawings/demo.webp" width={576} height={300} alt={t.demoAlt} />
      <span className="mt-1 block">{t.demoCaption}</span>
    </span>
  );
}

/**
 * Slides drawn as pictures while a lesson is written: off unless the teacher turns it on, because each picture is
 * one more request. Its tooltip shows what it makes.
 */
export function DrawingsSetting() {
  const drawings = usePrefs((s) => s.drawings);
  const set = usePrefs((s) => s.set);
  return (
    <div className="mt-6 max-w-md border-t border-rule pt-4">
      <div className="flex items-center gap-2">
        <Switch className="flex-1" isSelected={drawings} onChange={(on) => set({ drawings: on })}>
          {t.name}
        </Switch>
        <Tooltip delay={150} content={<Demo />}>
          <Button aria-label={t.about} className="grid size-7 place-items-center rounded-full text-ink-2 outline-none data-hovered:text-ink data-focus-visible:ring-2 data-focus-visible:ring-accent">
            <Info size={16} strokeWidth={1.75} aria-hidden />
          </Button>
        </Tooltip>
      </div>
      <p className="mt-1 font-ui text-13 leading-relaxed text-ink-2">{t.note}</p>
    </div>
  );
}
