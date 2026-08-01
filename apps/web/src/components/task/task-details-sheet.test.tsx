import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TaskDetailsSheet from "./task-details-sheet";

const useGetTask = vi.fn((_taskId?: string) => ({ data: { number: 104 } }));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: (taskId: string) => useGetTask(taskId),
}));
vi.mock("@/hooks/queries/board/use-get-board", () => ({
  default: () => ({ data: { slug: "KAN" } }),
}));
vi.mock("@/components/presence/board-access-avatars", () => ({
  default: () => null,
}));
vi.mock("./task-topbar-controls", () => ({ default: () => null }));
vi.mock("./task-properties-sidebar", () => ({ default: () => null }));
vi.mock("./task-details-content", () => ({ default: () => null }));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    <div data-testid="task-sheet" data-open={String(open)}>
      {children}
    </div>
  ),
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

beforeEach(() => {
  useGetTask.mockClear();
});

describe("TaskDetailsSheet close path", () => {
  it("closes immediately while route search cleanup is still pending", () => {
    const onClose = vi.fn();
    const props = {
      taskId: "task-104",
      boardId: "board-1",
      organizationId: "org-1",
      onClose,
    };
    const { rerender } = render(<TaskDetailsSheet {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "tasks:detail.close" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByTestId("task-sheet")).toHaveAttribute(
      "data-open",
      "false",
    );
    expect(useGetTask).toHaveBeenLastCalledWith("task-104");

    // The parent route has not removed taskId yet; it may be waiting on router work.
    rerender(<TaskDetailsSheet {...props} />);
    expect(screen.getByTestId("task-sheet")).toHaveAttribute(
      "data-open",
      "false",
    );
  });
});
