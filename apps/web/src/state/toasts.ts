import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  tone: 'neutral' | 'attention' | 'critical';
  action?: { label: string; run: () => void };
  /** Milliseconds; 0 keeps it until dismissed. */
  duration: number;
  /** A newer toast with the same key replaces the older one instead of stacking. */
  key?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'tone' | 'duration'> & Partial<Pick<Toast, 'tone' | 'duration'>>) => number;
  dismiss: (id: number) => void;
  /** Pause a toast's timer while the pointer or focus is on it. */
  hold: (id: number) => void;
  release: (id: number) => void;
}

let next = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const useToasts = create<ToastState>((set, get) => {
  const arm = (toast: Toast) => {
    clearTimeout(timers.get(toast.id));
    if (toast.duration > 0) timers.set(toast.id, setTimeout(() => get().dismiss(toast.id), toast.duration));
  };
  return {
    toasts: [],
    push: (t) => {
      const id = next++;
      // Something went wrong: it stays until it is read and closed, not for six seconds.
      const toast: Toast = { tone: 'neutral', duration: t.tone === 'critical' ? 0 : 6000, ...t, id };
      const kept = get().toasts.filter((x) => !toast.key || x.key !== toast.key);
      for (const gone of get().toasts) if (!kept.includes(gone)) clearTimeout(timers.get(gone.id));
      set({ toasts: [...kept.slice(-2), toast] });
      arm(toast);
      return id;
    },
    dismiss: (id) => {
      clearTimeout(timers.get(id));
      timers.delete(id);
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },
    hold: (id) => clearTimeout(timers.get(id)),
    release: (id) => {
      const toast = get().toasts.find((t) => t.id === id);
      if (toast) arm(toast);
    },
  };
});

export const toast = (...args: Parameters<ToastState['push']>): number => useToasts.getState().push(...args);
