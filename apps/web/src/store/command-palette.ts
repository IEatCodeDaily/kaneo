import { create } from "zustand";

/**
 * Single source of truth for the unified search + command palette.
 *
 * `/`, Ctrl/⌘+K and the sidebar search button all open the same dialog, so
 * they can't each own a local `open` state (that's how we ended up with three
 * stacked search dialogs fighting over `/`).
 */
type CommandPaletteState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
}));
