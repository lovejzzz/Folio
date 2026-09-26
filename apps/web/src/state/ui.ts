import { create } from 'zustand';

export type DrawerId = 'changes' | 'sources' | 'export';

interface UiState {
  drawer: DrawerId | null;
  commandOpen: boolean;
  /** When set, the connect-a-model dialog is open and runs this once connected. */
  connectThen: (() => void) | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  openDrawer: (d: DrawerId | null) => void;
  toggleDrawer: (d: DrawerId) => void;
  setCommandOpen: (open: boolean) => void;
  requireModel: (then: () => void) => void;
  closeConnect: () => void;
  setSaveState: (s: UiState['saveState']) => void;
}

export const useUi = create<UiState>((set, get) => ({
  drawer: null,
  commandOpen: false,
  connectThen: null,
  saveState: 'idle',
  openDrawer: (drawer) => set({ drawer }),
  toggleDrawer: (d) => set({ drawer: get().drawer === d ? null : d }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  requireModel: (then) => set({ connectThen: then }),
  closeConnect: () => set({ connectThen: null }),
  setSaveState: (saveState) => set({ saveState }),
}));
