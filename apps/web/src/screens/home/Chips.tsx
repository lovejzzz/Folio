import { NumberStepper, cx, popoverClass } from '@folio/ui';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, Dialog, DialogTrigger, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';
import { useT } from '../../i18n';
import { useDraft } from '../../state/draft';

const chipClass =
  'inline-flex h-8 items-center gap-1.5 rounded-full border border-rule bg-paper pl-3 pr-2 font-ui text-13 text-ink outline-none transition-colors duration-120 ' +
  'data-hovered:border-field data-pressed:bg-well data-focus-visible:ring-2 data-focus-visible:ring-accent';

function ChipButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Button aria-label={label} className={chipClass}>
      {children}
      <ChevronDown size={14} strokeWidth={1.75} className="text-ink-2" aria-hidden />
    </Button>
  );
}

const itemClass =
  'flex h-8 cursor-default items-center rounded-control px-2.5 font-ui text-14 text-ink outline-none data-focused:bg-well data-selected:font-medium data-selected:text-accent';

export function LevelChip() {
  const t = useT();
  const { level, set, pinned } = useDraft();
  const options = [...new Set([level, ...t.levels].filter(Boolean))];
  return (
    <MenuTrigger>
      <ChipButton label={`${t.home.level}: ${level || t.home.levelAny}`}>{level || t.home.levelAny}</ChipButton>
      <Popover placement="bottom start" offset={6} className={popoverClass}>
        <Menu
          aria-label={t.home.level}
          selectionMode="single"
          selectedKeys={[level || '__any']}
          onAction={(key) => set({ level: key === '__any' ? '' : String(key), pinned: { ...pinned, level: true } })}
          className="outline-none"
        >
          <MenuItem id="__any" className={itemClass}>
            {t.home.levelAny}
          </MenuItem>
          {options.map((o) => (
            <MenuItem key={o} id={o} className={itemClass}>
              {o}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

export function LessonsChip() {
  const t = useT();
  const { lessons, set, pinned } = useDraft();
  return (
    <DialogTrigger>
      <ChipButton label={`${t.plan.lessonsCount}: ${lessons}`}>{t.home.lessonsChip(lessons)}</ChipButton>
      <Popover placement="bottom start" offset={6} className={cx(popoverClass, 'p-3')}>
        <Dialog aria-label={t.plan.lessonsCount} className="outline-none">
          <NumberStepper
            label={t.plan.lessonsCount}
            minValue={1}
            maxValue={20}
            value={lessons}
            onChange={(v) => set({ lessons: Number.isFinite(v) ? v : 1, pinned: { ...pinned, lessons: true } })}
          />
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

export function LanguageChip() {
  const t = useT();
  const { language, set, pinned } = useDraft();
  return (
    <MenuTrigger>
      <ChipButton label={`${t.home.language}: ${t.languages[language]}`}>{t.languages[language]}</ChipButton>
      <Popover placement="bottom start" offset={6} className={popoverClass}>
        <Menu
          aria-label={t.home.language}
          selectionMode="single"
          selectedKeys={[language]}
          onAction={(key) => set({ language: key as 'en' | 'zh-CN', pinned: { ...pinned, language: true } })}
          className="outline-none"
        >
          {(['en', 'zh-CN'] as const).map((l) => (
            <MenuItem key={l} id={l} className={itemClass} lang={l}>
              {t.languages[l]}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
