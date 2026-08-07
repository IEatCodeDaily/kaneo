import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrashPage } from "./trash";

const mocks = vi.hoisted(() => ({
  restore: vi.fn(),
  permanentlyDelete: vi.fn(),
  trashed: [] as unknown[],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && Object.keys(options).length > 0
        ? `${key}:${JSON.stringify(options)}`
        : key,
  }),
}));

vi.mock("@/components/common/organization-layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/page-title", () => ({ default: () => null }));

vi.mock("@/hooks/queries/task/use-get-trashed-tasks", () => ({
  default: () => ({ data: mocks.trashed, isLoading: false }),
}));
vi.mock("@/hooks/mutations/task/use-restore-task", () => ({
  default: () => ({ mutate: mocks.restore, isPending: false }),
  useRestoreTask: () => ({ mutate: mocks.restore, isPending: false }),
}));
vi.mock("@/hooks/mutations/task/use-permanently-delete-task", () => ({
  default: () => ({ mutate: mocks.permanentlyDelete, isPending: false }),
  usePermanentlyDeleteTask: () => ({
    mutate: mocks.permanentlyDelete,
    isPending: false,
  }),
}));

const rows = [
  {
    id: "task-1",
    title: "Fix the login redirect",
    number: 12,
    boardId: "board-1",
    boardName: "Engineering",
    deletedAt: new Date("2026-07-30T10:00:00.000Z").toISOString(),
    deletedBy: "user-1",
    deletedByName: "Ada",
  },
  {
    id: "task-2",
    title: "Draft the launch post",
    number: 3,
    boardId: "board-2",
    boardName: "Marketing",
    deletedAt: new Date("2026-07-29T10:00:00.000Z").toISOString(),
    deletedBy: "user-2",
    deletedByName: "Grace",
  },
];

describe("TrashPage", () => {
  afterEach(() => {
    cleanup();
    mocks.restore.mockReset();
    mocks.permanentlyDelete.mockReset();
    mocks.trashed = [];
  });

  it("renders a row per trashed task grouped under its board", () => {
    mocks.trashed = rows;
    render(<TrashPage organizationId="org-1" />);

    expect(screen.getByText("Fix the login redirect")).toBeInTheDocument();
    expect(screen.getByText("Draft the launch post")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Marketing")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "trash:restore" }),
    ).toHaveLength(2);
  });

  it("shows who deleted the task and when", () => {
    mocks.trashed = [rows[0]];
    render(<TrashPage organizationId="org-1" />);

    const meta = screen.getByText(/trash:deletedMeta/);
    expect(meta.textContent).toContain('"who":"Ada"');
    expect(meta.textContent).toMatch(/"when":"[^"]+"/);
  });

  it("restores the clicked task by id", () => {
    mocks.trashed = rows;
    render(<TrashPage organizationId="org-1" />);

    fireEvent.click(
      screen.getAllByRole("button", { name: "trash:restore" })[1],
    );

    expect(mocks.restore).toHaveBeenCalledTimes(1);
    expect(mocks.restore).toHaveBeenCalledWith("task-2");
    expect(mocks.permanentlyDelete).not.toHaveBeenCalled();
  });

  it("gates permanent delete behind a confirmation dialog", () => {
    mocks.trashed = [rows[0]];
    render(<TrashPage organizationId="org-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "trash:deletePermanently" }),
    );

    // The click only opens the dialog - nothing is purged yet.
    expect(mocks.permanentlyDelete).not.toHaveBeenCalled();
    expect(screen.getByText("trash:confirmDelete.title")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "trash:confirmDelete.confirm" }),
    );

    expect(mocks.permanentlyDelete).toHaveBeenCalledTimes(1);
    expect(mocks.permanentlyDelete).toHaveBeenCalledWith("task-1");
  });

  it("cancelling the confirmation does not delete", () => {
    mocks.trashed = [rows[0]];
    render(<TrashPage organizationId="org-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "trash:deletePermanently" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "trash:confirmDelete.cancel" }),
    );

    expect(mocks.permanentlyDelete).not.toHaveBeenCalled();
  });
});
