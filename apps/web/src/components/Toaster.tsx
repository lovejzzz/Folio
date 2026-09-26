import { X } from 'lucide-react';
import { Button as AriaButton } from 'react-aria-components';
import { cx } from '@folio/ui';
import { useT } from '../i18n';
import { useToasts } from '../state/toasts';

/** Toasts stack bottom-centre and are announced politely. */
export function Toaster() {
  const t = useT();
  const { toasts, dismiss } = useToasts();
  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          className={cx(
            'pointer-events-auto flex max-w-lg items-center gap-3 rounded-sheet bg-ink py-2 pl-4 pr-2 font-ui text-14 text-paper shadow-overlay animate-pop-in',
          )}
        >
          {item.tone !== 'neutral' && (
            <span aria-hidden className={cx('size-2 shrink-0 rotate-45', item.tone === 'critical' ? 'bg-critical' : 'bg-attention')} />
          )}
          <span className="py-1">{item.message}</span>
          {item.action && (
            <AriaButton
              onPress={() => {
                item.action?.run();
                dismiss(item.id);
              }}
              className="rounded-control px-2 py-1 font-medium text-paper underline underline-offset-4 outline-none data-hovered:bg-ink-2 data-focus-visible:ring-2 data-focus-visible:ring-paper"
            >
              {item.action.label}
            </AriaButton>
          )}
          <AriaButton
            aria-label={t.toast.dismiss}
            onPress={() => dismiss(item.id)}
            className="flex size-7 items-center justify-center rounded-control text-paper/70 outline-none data-hovered:text-paper data-focus-visible:ring-2 data-focus-visible:ring-paper"
          >
            <X size={16} strokeWidth={1.5} />
          </AriaButton>
        </div>
      ))}
    </div>
  );
}
