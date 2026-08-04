import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoardWithTasks } from "@/types/board";
import { ArchiveBoardDialog } from "./nav-boards";

const toastError = vi.fn();

vi.mock("@/lib/toast", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  },
}));

const board = {
  id: "board-1",
  name: "Roadmap",
} as BoardWithTasks;

afterEach(() => {
  toastError.mockReset();
});

describe("ArchiveBoardDialog", () => {
  it("keeps the confirmation open and disables its actions while pending", () => {
    const onArchive = vi.fn();
    const onClose = vi.fn();
    render(
      <ArchiveBoardDialog
        board={board}
        isPending
        onArchive={onArchive}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Archiving…" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("surfaces a failed archive and leaves the confirmation open", async () => {
    const failure = new Error("Archive request failed");
    const onArchive = vi.fn().mockRejectedValue(failure);
    const onClose = vi.fn();
    render(
      <ArchiveBoardDialog
        board={board}
        isPending={false}
        onArchive={onArchive}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive board" }));

    await waitFor(() => expect(onArchive).toHaveBeenCalledWith(board));
    expect(toastError).toHaveBeenCalledWith("Archive request failed");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("delegates success without closing before the archive resolves", async () => {
    let resolveArchive: (() => void) | undefined;
    const onArchive = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveArchive = resolve;
        }),
    );
    const onClose = vi.fn();
    render(
      <ArchiveBoardDialog
        board={board}
        isPending={false}
        onArchive={onArchive}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive board" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    resolveArchive?.();
    await waitFor(() => expect(onArchive).toHaveBeenCalledTimes(1));
  });
});
