import { IconButton, cx } from '@folio/ui';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';

interface EditableListProps {
  items: string[];
  onChange: (items: string[]) => void;
  label: string;
  addLabel: string;
  /** Shown in an empty item, such as the one Add opens. */
  placeholder: string;
  ordered?: boolean;
  lang?: string;
  context?: string;
  className?: string;
  itemClassName?: string;
}

/** A list of short texts, each edited in place, with add and remove. */
export function EditableList({ items, onChange, label, addLabel, placeholder, ordered, lang, context, className, itemClassName }: EditableListProps) {
  const t = useT();
  // Add opens an empty item with the caret in it; it joins the list only once something is typed.
  const [drafting, setDrafting] = useState(false);
  const List = ordered ? 'ol' : 'ul';
  return (
    <div className={className}>
      <List aria-label={label} className={cx('space-y-1.5 pl-6', ordered ? 'list-decimal marker:font-ui marker:text-14 marker:text-ink-2' : 'list-disc marker:text-ink-3')}>
        {items.map((item, i) => (
          <li key={i} className={cx('group/item pl-1', itemClassName)}>
            <span className="flex items-start gap-1">
              <EditableText
                value={item}
                label={`${label} ${i + 1}`}
                placeholder={placeholder}
                lang={lang}
                context={context}
                multiline
                className="min-w-0 flex-1"
                onCommit={(next) => onChange(next.trim() ? items.map((x, j) => (j === i ? next : x)) : items.filter((_, j) => j !== i))}
              />
              <IconButton
                size="sm"
                tooltip={false}
                label={t.common.labelled(t.common.remove, `${label} ${i + 1}`)}
                className="no-print mt-0.5 size-6 opacity-0 group-focus-within/item:opacity-100 group-hover/item:opacity-100"
                onPress={() => onChange(items.filter((_, j) => j !== i))}
              >
                <X size={13} strokeWidth={1.5} />
              </IconButton>
            </span>
          </li>
        ))}
        {drafting && (
          <li className={cx('no-print pl-1', itemClassName)} onBlur={() => setDrafting(false)}>
            <EditableText
              autoFocus
              value=""
              label={`${label} ${items.length + 1}`}
              placeholder={placeholder}
              lang={lang}
              context={context}
              multiline
              className="block"
              onCommit={(next) => next.trim() && onChange([...items, next])}
            />
          </li>
        )}
      </List>
      <AddButton label={addLabel} onPress={() => setDrafting(true)} />
    </div>
  );
}

export function AddButton({ label, onPress, className }: { label: string; onPress: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={cx(
        'no-print mt-2 inline-flex items-center gap-1.5 rounded-control px-1 py-0.5 font-ui text-13 text-ink-2 outline-none transition-colors duration-120 hover:text-accent focus-visible:ring-2 focus-visible:ring-accent',
        className,
      )}
    >
      <Plus size={13} strokeWidth={1.75} aria-hidden />
      {label}
    </button>
  );
}
