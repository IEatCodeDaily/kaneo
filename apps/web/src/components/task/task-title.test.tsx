import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TASK_TITLE_SAVE_DELAY_MS } from "@/lib/task-title-save";
import TaskTitle from "./task-title";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  task: { id: "task-1", title: "Old title", description: "" },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: () => ({ data: mocks.task }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-title", () => ({
  useUpdateTaskTitle: () => ({ mutateAsync: mocks.update }),
}));

vi.mock("@/hooks/use-organization-permission", () => ({
  useOrganizationPermission: () => ({ canManageTasks: () => true }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.update.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TaskTitle persistence", () => {
  it("flushes the final title when navigation unmounts before the debounce", async () => {
    const view = render(<TaskTitle taskId="task-1" />);
    const input = screen.getByDisplayValue("Old title");

    fireEvent.change(input, { target: { value: "Final title" } });
    expect(mocks.update).not.toHaveBeenCalled();

    // Simulates navigating to a parent/subtask before the 800ms save timer.
    view.unmount();
    // flush() invokes the pending save synchronously during cleanup; do not
    // advance the old timer, because that would let the broken implementation
    // save after unmount and turn this into a false pass.
    await Promise.resolve();

    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-1", title: "Final title" }),
    );
  });

  it("sends one update for a burst of keystrokes instead of one per character", async () => {
    render(<TaskTitle taskId="task-1" />);
    const input = screen.getByDisplayValue("Old title");

    for (const value of ["Old titleA", "Old titleAB", "Old titleABC"]) {
      fireEvent.change(input, { target: { value } });
      await vi.advanceTimersByTimeAsync(60);
    }

    // Mid-typing: the API must not have been touched yet.
    expect(mocks.update).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(TASK_TITLE_SAVE_DELAY_MS);

    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-1", title: "Old titleABC" }),
    );
  });

  it("saves immediately on blur without waiting out the debounce", async () => {
    render(<TaskTitle taskId="task-1" />);
    const input = screen.getByDisplayValue("Old title");

    fireEvent.change(input, { target: { value: "Blurred title" } });
    expect(mocks.update).not.toHaveBeenCalled();

    fireEvent.blur(input);
    await Promise.resolve();

    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-1", title: "Blurred title" }),
    );

    // The blur already saved; the cancelled timer must not duplicate it.
    await vi.advanceTimersByTimeAsync(TASK_TITLE_SAVE_DELAY_MS * 2);
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("does not save when the title never changed", async () => {
    render(<TaskTitle taskId="task-1" />);
    const input = screen.getByDisplayValue("Old title");

    fireEvent.blur(input);
    await vi.advanceTimersByTimeAsync(TASK_TITLE_SAVE_DELAY_MS * 2);

    expect(mocks.update).not.toHaveBeenCalled();
  });
});

/**
 * #164: the field was bound with `values: { title: task?.title }`, so
 * react-hook-form re-synced it from the server on every render. A background
 * refetch or a rename elsewhere therefore overwrote what the user was typing.
 * Local edits must win while the field is being edited.
 */
describe("#164 optimistic-local-wins while editing", () => {
  afterEach(() => {
    mocks.task = { id: "task-1", title: "Old title", description: "" };
  });

  it("keeps the user's text when a server title arrives mid-edit", async () => {
    const view = render(<TaskTitle taskId="task-1" />);
    const input = screen.getByDisplayValue("Old title");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "My local edit" } });

    // A refetch lands with a different title while the user is still typing.
    mocks.task = { ...mocks.task, title: "Renamed on the server" };
    view.rerender(<TaskTitle taskId="task-1" />);

    // The regression: this used to become "Renamed on the server".
    expect((input as HTMLInputElement).value).toBe("My local edit");
  });

  // NEGATIVE CONTROL: when the user is NOT editing, a server rename must still
  // appear — otherwise the assertion above would pass for a field that simply
  // ignores the server forever.
  it("adopts a server title when the field is not being edited", async () => {
    const view = render(<TaskTitle taskId="task-1" />);
    const input = screen.getByDisplayValue("Old title");

    fireEvent.focus(input);
    fireEvent.blur(input);
    await vi.advanceTimersByTimeAsync(TASK_TITLE_SAVE_DELAY_MS * 2);

    mocks.task = { ...mocks.task, title: "Renamed elsewhere" };
    view.rerender(<TaskTitle taskId="task-1" />);

    expect((input as HTMLInputElement).value).toBe("Renamed elsewhere");
  });

  it("still persists the local edit that beat the server value", async () => {
    render(<TaskTitle taskId="task-1" />);
    const input = screen.getByDisplayValue("Old title");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Local wins" } });
    await vi.advanceTimersByTimeAsync(TASK_TITLE_SAVE_DELAY_MS * 2);

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Local wins" }),
    );
  });
});

describe("#164 saving spinner", () => {
  it("shows a spinner only while the write is in flight", async () => {
    // Hold the mutation open so the in-flight window is observable.
    let release: (() => void) | undefined;
    mocks.update.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    render(<TaskTitle taskId="task-1" />);
    const input = screen.getByDisplayValue("Old title");

    expect(screen.queryByTestId("task-title-saving")).toBeNull();

    fireEvent.change(input, { target: { value: "Saving now" } });
    await vi.advanceTimersByTimeAsync(TASK_TITLE_SAVE_DELAY_MS * 2);

    expect(screen.getByTestId("task-title-saving")).toBeTruthy();

    release?.();
    await vi.advanceTimersByTimeAsync(0);

    expect(screen.queryByTestId("task-title-saving")).toBeNull();
  });

  // NEGATIVE CONTROL: no spinner without an edit, so the assertion above
  // cannot pass for a spinner that is simply always mounted.
  it("shows no spinner when nothing is being saved", async () => {
    render(<TaskTitle taskId="task-1" />);
    await vi.advanceTimersByTimeAsync(TASK_TITLE_SAVE_DELAY_MS * 2);

    expect(screen.queryByTestId("task-title-saving")).toBeNull();
  });
});
