import { Dialog, Kbd, cx } from '@folio/ui';
import { useNavigate } from '@tanstack/react-router';
import { Search, Sparkles } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { useT } from '../../i18n';
import { useCourse } from '../../state/session';
import { useUi } from '../../state/ui';
import { AskPanel } from './AskPanel';
import { commandItems, matches, type CommandItem } from './items';

/** ⌘K: go anywhere, run an action, or ask for a change to the course. */
export function CommandBar() {
  const t = useT();
  const course = useCourse();
  const navigate = useNavigate();
  const { commandOpen, setCommandOpen } = useUi();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [asking, setAsking] = useState<string | null>(null);
  const listId = useId();

  const close = () => {
    setCommandOpen(false);
    setQuery('');
    setActive(0);
    setAsking(null);
  };
  const items = commandItems(course, t, navigate).filter((i) => !query.trim() || matches(i.label, query));
  const ask: CommandItem | null =
    query.trim().length > 3
      ? { id: 'ask', group: 'actions', label: t.command.askItem(query.trim()), icon: <Sparkles size={16} strokeWidth={1.5} className="text-accent" />, run: () => setAsking(query.trim()) }
      : null;
  const all = ask ? [...items, ask] : items;
  const run = (item: CommandItem) => {
    if (item.id !== 'ask') close();
    item.run();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % Math.max(1, all.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = all[active];
      if (item) run(item);
    }
  };
  const groups: { id: CommandItem['group'] | 'ask'; label: string }[] = [
    { id: 'goTo', label: t.command.goTo },
    { id: 'materials', label: t.command.materials },
    { id: 'actions', label: t.command.actions },
  ];

  return (
    <Dialog isOpen={commandOpen} onOpenChange={(open) => !open && close()} title={t.nav.commandBar} top size="lg">
      {asking ? (
        <AskPanel request={asking} onDone={close} onBack={() => setAsking(null)} />
      ) : (
        <div onKeyDown={onKeyDown}>
          <div className="flex items-center gap-3 border-b border-rule px-4">
            <Search size={18} strokeWidth={1.5} className="shrink-0 text-ink-2" aria-hidden />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={all[active] ? `${listId}-${all[active]!.id}` : undefined}
              aria-label={t.nav.commandBar}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder={t.command.placeholder}
              className="h-14 min-w-0 flex-1 bg-transparent font-ui text-16 text-ink outline-none placeholder:text-ink-2"
            />
            <Kbd>esc</Kbd>
          </div>
          <div id={listId} role="listbox" aria-label={t.nav.commandBar} className="max-h-96 overflow-y-auto p-2">
            {all.length === 0 && <p className="px-3 py-6 text-center font-ui text-14 text-ink-2">{t.command.noResults}</p>}
            {groups.map((g) => {
              const inGroup = items.filter((i) => i.group === g.id);
              if (!inGroup.length) return null;
              return (
                <div key={g.id} role="group" aria-label={g.label} className="mb-1">
                  <p className="px-3 pb-1 pt-2 font-ui text-12 font-medium text-ink-2">{g.label}</p>
                  {inGroup.map((item) => (
                    <Option key={item.id} id={`${listId}-${item.id}`} item={item} active={all[active]?.id === item.id} onRun={() => run(item)} onHover={() => setActive(all.indexOf(item))} />
                  ))}
                </div>
              );
            })}
            {ask && (
              <div role="group" aria-label={t.command.ask} className="mt-1 border-t border-rule pt-1">
                <p className="px-3 pb-1 pt-2 font-ui text-12 font-medium text-ink-2">{t.command.ask}</p>
                <Option id={`${listId}-ask`} item={ask} active={all[active]?.id === 'ask'} onRun={() => run(ask)} onHover={() => setActive(all.length - 1)} hint={t.command.askHint} />
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Option({ id, item, active, onRun, onHover, hint }: { id: string; item: CommandItem; active: boolean; onRun: () => void; onHover: () => void; hint?: string }) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={onRun}
      className={cx('flex cursor-default items-center gap-3 rounded-control px-3 py-2 font-ui text-14 text-ink', active && 'bg-accent-tint')}
    >
      {item.icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.label}</span>
        {hint && <span className="block text-12 text-ink-2">{hint}</span>}
      </span>
      {item.hint && <Kbd>{item.hint}</Kbd>}
    </div>
  );
}
