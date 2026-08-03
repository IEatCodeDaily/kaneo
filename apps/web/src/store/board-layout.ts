import { create } from "zustand";

type BoardLayoutState = {
  propertiesPanelBoardId: string | null;
  openPropertiesPanel: (boardId: string) => void;
  closePropertiesPanel: () => void;
};

export const useBoardLayoutStore = create<BoardLayoutState>((set) => ({
  propertiesPanelBoardId: null,
  openPropertiesPanel: (boardId) => set({ propertiesPanelBoardId: boardId }),
  closePropertiesPanel: () => set({ propertiesPanelBoardId: null }),
}));
