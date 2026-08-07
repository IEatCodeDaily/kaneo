import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The indicator is a loading TOAST, not an in-view element. The previous
 * sticky/fixed pill occupied layout space (the gantt variant lived inside the
 * scroll container), so every drag-save pushed rows down and snapped them
 * back. These tests pin the toast contract: open while pending, dismissed on
 * completion AND on unmount.
 */

const mocks = vi.hoisted(() => ({
  loading: vi.fn(() => "toast-1"),
  dismiss: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
  toast: { loading: mocks.loading, dismiss: mocks.dismiss },
}));

import { PendingSyncIndicator } from "./pending-sync-indicator";

afterEach(() => {
  cleanup();
  mocks.loading.mockClear();
  mocks.dismiss.mockClear();
});

describe("PendingSyncIndicator", () => {
  it("opens a loading toast while pending and dismisses when done", () => {
    const { rerender } = render(<PendingSyncIndicator pending={false} />);
    expect(mocks.loading).not.toHaveBeenCalled();

    rerender(<PendingSyncIndicator pending />);
    expect(mocks.loading).toHaveBeenCalledWith("Saving changes…");

    rerender(<PendingSyncIndicator pending={false} />);
    expect(mocks.dismiss).toHaveBeenCalledWith("toast-1");
  });

  it("renders nothing into the view (no layout impact)", () => {
    const { container } = render(<PendingSyncIndicator pending />);
    expect(container.innerHTML).toBe("");
  });

  it("uses the provided label (gantt says Saving move…)", () => {
    render(<PendingSyncIndicator label="Saving move…" pending />);
    expect(mocks.loading).toHaveBeenCalledWith("Saving move…");
  });

  it("dismisses a stranded toast on unmount", () => {
    const { unmount } = render(<PendingSyncIndicator pending />);
    unmount();
    expect(mocks.dismiss).toHaveBeenCalledWith("toast-1");
  });

  it("does not stack toasts across pending flickers", () => {
    const { rerender } = render(<PendingSyncIndicator pending />);
    rerender(<PendingSyncIndicator pending />);
    rerender(<PendingSyncIndicator pending />);
    expect(mocks.loading).toHaveBeenCalledTimes(1);
  });
});
