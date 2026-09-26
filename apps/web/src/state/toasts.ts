import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  tone: 'neutral' | 'attention' | 'critical';
  action?: { label: string; run: () => void };
  /** Milliseconds; 0 keeps it until dismissed. */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'tone' | 'duration'> & Partial<Pick<Toast, 'tone' | 'duration'>>) => number;
  dismiss: (id: number) => void;
}

let next = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = next++;
    const toast: Toast = { tone: 'neutral', duration: 6000, ...t, id };
    set({ toasts: [...get().toasts.slice(-2), toast] });
    if (toast.duration > 0) setTimeout(() => get().dismiss(id), toast.duration);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (...args: Parameters<ToastState['push']>): number => useToasts.getState().push(...args);
