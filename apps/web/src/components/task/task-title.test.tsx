import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TaskTitle from "./task-title";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  task: { id: "task-1", title: "Old title", description: "" },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
});
