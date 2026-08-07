import { beforeEach, describe, expect, it } from "vitest";
import useBacklogBulkSelectionStore from "./backlog-bulk-selection";

describe("backlog bulk selection", () => {
  beforeEach(() => useBacklogBulkSelectionStore.getState().clearSelection());

  it("enters selection mode before any ticket is selected and selects a section", () => {
    const store = useBacklogBulkSelectionStore.getState();
    store.setSelectMode(true);
    expect(useBacklogBulkSelectionStore.getState().isSelectMode).toBe(true);
    expect(useBacklogBulkSelectionStore.getState().selectedTaskIds.size).toBe(
      0,
    );

    store.selectTasks(["one", "two"]);
    expect([
      ...useBacklogBulkSelectionStore.getState().selectedTaskIds,
    ]).toEqual(["one", "two"]);

    store.setSelectMode(false);
    expect(useBacklogBulkSelectionStore.getState().selectedTaskIds.size).toBe(
      0,
    );
  });
});
