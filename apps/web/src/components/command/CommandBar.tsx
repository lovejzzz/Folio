import { Dialog, Kbd, cx } from '@folio/ui';
import { useNavigate } from '@tanstack/react-router';
import { Search, Sparkles } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { useT } from '../../i18n';
import { useCourse } from '../../state/session';
import { useUi } from '../../state/ui';
import { AskPanel } from './AskPanel';
import { commandItems, matches, type CommandItem } from './items';

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

interface ListProps {
  listId: string;
  items: CommandItem[];
  ask: CommandItem | null;
  activeId: string | undefined;
  onRun: (item: CommandItem) => void;
  onHover: (item: CommandItem) => void;
}

function CommandList({ listId, items, ask, activeId, onRun, onHover }: ListProps) {
  const t = useT();
  const groups = [
    { id: 'goTo', label: t.command.goTo },
    { id: 'materials', label: t.command.materials },
    { id: 'actions', label: t.command.actions },
  ] as const;
  const option = (item: CommandItem, hint?: string) => (
    <Option key={item.id} id={`${listId}-${item.id}`} item={item} active={activeId === item.id} onRun={() => onRun(item)} onHover={() => onHover(item)} hint={hint} />
  );
  return (
    <div id={listId} role="listbox" aria-label={t.nav.commandBar} className="max-h-96 overflow-y-auto p-2">
      {items.length === 0 && !ask && <p className="px-3 py-6 text-center font-ui text-14 text-ink-2">{t.command.noResults}</p>}
      {groups.map((g) => {
        const inGroup = items.filter((i) => i.group === g.id);
        return inGroup.length ? (
          <div key={g.id} role="group" aria-label={g.label} className="mb-1">
            <p className="px-3 pb-1 pt-2 font-ui text-12 font-medium text-ink-2">{g.label}</p>
            {inGroup.map((item) => option(item))}
          </div>
        ) : null;
      })}
      {ask && (
        <div role="group" aria-label={t.command.ask} className="mt-1 border-t border-rule pt-1">
          <p className="px-3 pb-1 pt-2 font-ui text-12 font-medium text-ink-2">{t.command.ask}</p>
          {option(ask, t.command.askHint)}
        </div>
      )}
    </div>
  );
}

function SearchInput({ listId, activeId, value, onChange }: { listId: string; activeId: string | undefined; value: string; onChange: (v: string) => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 border-b border-rule px-4">
      <Search size={18} strokeWidth={1.5} className="shrink-0 text-ink-2" aria-hidden />
      <input
        autoFocus
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-label={t.nav.commandBar}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t.command.placeholder}
        className="h-14 min-w-0 flex-1 bg-transparent font-ui text-16 text-ink outline-none placeholder:text-ink-2"
      />
      <Kbd>esc</Kbd>
    </div>
  );
}

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
  const q = query.trim();
  const ask: CommandItem | null = q.length > 3 ? { id: 'ask', group: 'actions', label: t.command.askItem(q), icon: <Sparkles size={16} strokeWidth={1.5} className="text-accent" />, run: () => setAsking(q) } : null;
  const all = ask ? [...items, ask] : items;
  const run = (item: CommandItem) => {
    if (item.id !== 'ask') close();
    item.run();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % Math.max(1, all.length));
    } else if (e.key === 'Enter' && all[active]) {
      e.preventDefault();
      run(all[active]!);
    }
  };
  return (
    <Dialog isOpen={commandOpen} onOpenChange={(open) => !open && close()} title={t.nav.commandBar} top size="lg">
      {asking ? (
        <AskPanel request={asking} onDone={close} onBack={() => setAsking(null)} />
      ) : (
        <div onKeyDown={onKeyDown}>
          <SearchInput listId={listId} activeId={all[active] ? `${listId}-${all[active]!.id}` : undefined} value={query} onChange={(v) => { setQuery(v); setActive(0); }} />
          <CommandList listId={listId} items={items} ask={ask} activeId={all[active]?.id} onRun={run} onHover={(item) => setActive(all.indexOf(item))} />
        </div>
      )}
    </Dialog>
  );
}
