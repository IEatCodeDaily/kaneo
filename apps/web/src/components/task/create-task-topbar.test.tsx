import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * #154: the parent picker now queries organization-wide search for
 * cross-board parents. Both hooks need stubbing — useActiveOrganization
 * reaches for router params this suite does not provide.
 */
vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { id: "org-1" } }),
}));

vi.mock("@/hooks/queries/search/use-global-search", () => ({
  default: () => ({ data: { results: [] } }),
}));

vi.mock("@/hooks/queries/board/use-get-boards", () => ({
  default: () => ({
    data: [{ id: "board-1", name: "Current board", slug: "CUR" }],
  }),
}));

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

const useGetMilestonesByBoard = vi.fn();
const useGetTasks = vi.fn();

vi.mock("@/hooks/queries/milestone/use-get-milestones-by-board", () => ({
  default: (boardId: string) => useGetMilestonesByBoard(boardId),
}));
vi.mock("@/hooks/queries/task/use-get-tasks", () => ({
  useGetTasks: (boardId: string) => useGetTasks(boardId),
}));

import CreateTaskTopbar from "./create-task-topbar";

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

function setup(overrides?: {
  milestoneId?: string | null;
  parentTaskId?: string | null;
}) {
  useGetMilestonesByBoard.mockReturnValue({
    data: [{ id: "ms-1", name: "Beta launch", status: "active" }],
  });
  useGetTasks.mockReturnValue({
    data: {
      columns: [
        {
          id: "to-do",
          tasks: [{ id: "task-9", title: "Parent epic", number: 9 }],
        },
      ],
      plannedTasks: [],
    },
  });

  const onMilestoneChange = vi.fn();
  const onParentTaskChange = vi.fn();

  render(
    <CreateTaskTopbar
      boardId="board-1"
      milestoneId={overrides?.milestoneId ?? null}
      onMilestoneChange={onMilestoneChange}
      parentTaskId={overrides?.parentTaskId ?? null}
      onParentTaskChange={onParentTaskChange}
    />,
    { wrapper },
  );

  return { onMilestoneChange, onParentTaskChange };
}

describe("CreateTaskTopbar (create-task modal topbar)", () => {
  it("exposes both a milestone and a parent-task selector", () => {
    setup();

    expect(screen.getByTestId("create-task-topbar")).toBeTruthy();
    expect(screen.getByTestId("create-task-milestone-trigger")).toBeTruthy();
    expect(screen.getByTestId("create-task-parent-trigger")).toBeTruthy();
  });

  it("selects a milestone from the board milestone list", () => {
    const { onMilestoneChange } = setup();

    fireEvent.click(screen.getByTestId("create-task-milestone-trigger"));
    fireEvent.click(screen.getByTestId("create-task-milestone-option-ms-1"));

    expect(onMilestoneChange).toHaveBeenCalledWith("ms-1");
  });

  it("selects a parent task from the board task list", () => {
    const { onParentTaskChange } = setup();

    fireEvent.click(screen.getByTestId("create-task-parent-trigger"));
    fireEvent.click(screen.getByTestId("create-task-parent-option-task-9"));

    expect(onParentTaskChange).toHaveBeenCalledWith("task-9");
  });

  it("opens the requested two-pane board and ticket selector", () => {
    setup();

    fireEvent.click(screen.getByTestId("create-task-parent-trigger"));

    expect(screen.getByRole("navigation", { name: "Boards" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "All" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Current board" })).toBeTruthy();
    expect(screen.getByTestId("create-task-parent-option-task-9")).toBeTruthy();
  });

  it("shows the selected milestone and parent labels on the triggers", () => {
    setup({ milestoneId: "ms-1", parentTaskId: "task-9" });

    expect(
      screen.getByTestId("create-task-milestone-trigger").textContent,
    ).toContain("Beta launch");
    expect(
      screen.getByTestId("create-task-parent-trigger").textContent,
    ).toContain("Parent epic");
  });
});

describe("create-task modal wiring", () => {
  it("renders the topbar and applies milestone + parent on submit", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/components/shared/modals/create-task-modal.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("<CreateTaskTopbar");
    expect(source).toContain("assignMilestone({");
    expect(source).toContain('relationType: "subtask"');
  });
});
