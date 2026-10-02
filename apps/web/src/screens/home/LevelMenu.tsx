import { cx, popoverClass } from '@folio/ui';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Button, Menu, MenuItem, MenuTrigger, Popover, SubmenuTrigger, type Key } from 'react-aria-components';
import { useT } from '../../i18n';
import { useDraft } from '../../state/draft';
import { chipLook } from './Chips';

const ANY = 'any';
const itemClass = 'flex h-8 cursor-default items-center gap-2 rounded-control px-2 font-ui text-14 text-ink outline-none data-focused:bg-well data-open:bg-well';

function Item({ id, label, chosen, more = false }: { id: string; label: string; chosen: boolean; more?: boolean }) {
  return (
    <MenuItem id={id} textValue={label} className={itemClass}>
      <span className="flex w-4 justify-center text-accent" aria-hidden>
        {chosen && <Check size={14} strokeWidth={2} />}
      </span>
      <span className="flex-1 whitespace-nowrap">{label}</span>
      {more && <ChevronRight size={14} strokeWidth={1.75} className="text-ink-2" aria-hidden />}
    </MenuItem>
  );
}

/** The chip's face, also shown while the menu loads. */
export function LevelFace({ label }: { label: string }) {
  return (
    <>
      {label}
      <ChevronDown size={14} strokeWidth={1.75} className="text-ink-2" aria-hidden />
    </>
  );
}

export const levelChipClass = cx(chipLook, 'inline-flex items-center gap-1.5 pl-4 pr-3');

/** The level: a stage, or within a school stage one grade (a second menu opens beside it). */
export function LevelMenu() {
  const t = useT();
  const { level, set, pinned } = useDraft();
  const choose = (key: Key) => set({ level: key === ANY ? '' : String(key), pinned: { ...pinned, level: true } });
  return (
    <MenuTrigger>
      <Button aria-label={t.home.level} className={levelChipClass}>
        <LevelFace label={level || t.home.levelAny} />
      </Button>
      <Popover placement="bottom start" offset={6} className={popoverClass}>
        <Menu aria-label={t.home.level} onAction={choose} className="outline-none">
          <Item id={ANY} label={t.home.levelAny} chosen={!level} />
          {t.levelGroups.map((g) =>
            g.grades.length ? (
              <SubmenuTrigger key={g.name}>
                <Item id={`stage:${g.name}`} label={g.name} chosen={level === g.name || g.grades.includes(level)} more />
                <Popover placement="end top" offset={4} className={popoverClass}>
                  <Menu aria-label={g.name} onAction={choose} className="outline-none">
                    <Item id={g.name} label={t.home.levelAnyGrade(g.name)} chosen={level === g.name} />
                    {g.grades.map((grade) => (
                      <Item key={grade} id={grade} label={grade} chosen={level === grade} />
                    ))}
                  </Menu>
                </Popover>
              </SubmenuTrigger>
            ) : (
              <Item key={g.name} id={g.name} label={g.name} chosen={level === g.name} />
            ),
          )}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
