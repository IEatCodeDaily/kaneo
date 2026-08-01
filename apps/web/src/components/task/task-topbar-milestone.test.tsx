import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const useGetTask = vi.fn();
const useGetMilestonesByBoard = vi.fn();

vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: (taskId: string) => useGetTask(taskId),
}));
vi.mock("@/hooks/queries/milestone/use-get-milestones-by-board", () => ({
  default: (boardId: string) => useGetMilestonesByBoard(boardId),
}));
vi.mock("@/hooks/mutations/milestone/use-assign-milestone-to-task", () => ({
  default: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import TaskTopbarMilestone from "./task-topbar-milestone";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TaskTopbarMilestone (task-detail topbar)", () => {
  it("renders the milestone picker with the assigned milestone name", () => {
    useGetTask.mockReturnValue({
      data: { id: "task-1", boardId: "board-1", milestoneId: "ms-1" },
    });
    useGetMilestonesByBoard.mockReturnValue({
      data: [
        { id: "ms-1", name: "Beta launch", status: "active" },
        { id: "ms-2", name: "GA", status: "planned" },
      ],
    });

    render(<TaskTopbarMilestone taskId="task-1" boardId="board-1" />, {
      wrapper,
    });

    const container = screen.getByTestId("task-topbar-milestone");
    expect(container).toBeTruthy();
    expect(screen.getByTestId("task-milestone-trigger").textContent).toContain(
      "Beta launch",
    );
    // Picker must live inside the topbar slot, not the properties sidebar.
    expect(
      container.querySelector('[data-testid="task-milestone-trigger"]'),
    ).toBeTruthy();
  });

  it("falls back to the empty milestone label when unassigned", () => {
    useGetTask.mockReturnValue({
      data: { id: "task-1", boardId: "board-1", milestoneId: null },
    });
    useGetMilestonesByBoard.mockReturnValue({ data: [] });

    render(<TaskTopbarMilestone taskId="task-1" boardId="board-1" />, {
      wrapper,
    });

    expect(screen.getByTestId("task-milestone-trigger").textContent).toContain(
      "tasks:milestone.none",
    );
  });
});

describe("TaskPropertiesSidebar no longer owns the milestone picker", () => {
  it("does not render a milestone trigger anymore", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/components/task/task-properties-sidebar.tsx",
      ),
      "utf8",
    );
    expect(source).not.toContain("TaskMilestonePicker");
  });
});
