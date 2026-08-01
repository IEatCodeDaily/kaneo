import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

const createTaskFlagMock = vi.fn();
const resolveTaskFlagMock = vi.fn();
const taskFlags: unknown[] = [];
const flagTypes = [
  {
    id: "type-blocked",
    boardId: "board-1",
    name: "Blocked",
    color: "#ef4444",
    icon: null,
    position: 0,
  },
];

vi.mock("@/hooks/queries/flag/use-get-task-flags", () => ({
  default: () => ({ data: taskFlags }),
}));
vi.mock("@/hooks/queries/flag/use-get-board-flag-types", () => ({
  default: () => ({ data: flagTypes }),
}));
vi.mock("@/hooks/mutations/flag/use-create-task-flag", () => ({
  default: () => ({ mutate: createTaskFlagMock }),
}));
vi.mock("@/hooks/mutations/flag/use-resolve-task-flag", () => ({
  default: () => ({ mutate: resolveTaskFlagMock }),
}));

import FlagDialog from "@/components/flag/flag-dialog";
import TaskFlagBadges from "@/components/flag/task-flag-badges";

function setFlags(next: unknown[]) {
  taskFlags.length = 0;
  taskFlags.push(...next);
}

const activeFlag = {
  id: "flag-1",
  taskId: "task-1",
  flagTypeId: "type-blocked",
  flagTypeName: "Blocked",
  flagTypeColor: "#ef4444",
  flagTypeIcon: null,
  flaggedBy: "user-a",
  flaggedByName: "User A",
  targetUserId: "user-b",
  targetUserName: "User B",
  targetTeamId: null,
  targetTeamName: null,
  note: null,
  resolvedAt: null,
  resolvedBy: null,
  resolvedByName: null,
  createdAt: "2026-07-31T00:00:00.000Z",
};

afterEach(() => {
  cleanup();
  createTaskFlagMock.mockReset();
  resolveTaskFlagMock.mockReset();
  setFlags([]);
});

describe("TaskFlagBadges", () => {
  it("renders the active flag's type name on the card", () => {
    setFlags([activeFlag]);
    render(<TaskFlagBadges taskId="task-1" />);
    expect(screen.getByText("Blocked")).toBeTruthy();
  });

  it("renders nothing when every flag is resolved", () => {
    setFlags([{ ...activeFlag, resolvedAt: "2026-07-31T01:00:00.000Z" }]);
    const { container } = render(<TaskFlagBadges taskId="task-1" />);
    expect(container.textContent).toBe("");
  });
});

describe("FlagDialog target rules", () => {
  function renderDialog() {
    return render(
      <FlagDialog
        taskId="task-1"
        boardId="board-1"
        users={[{ id: "user-b", name: "User B" }]}
        teams={[{ id: "team-1", name: "Team One" }]}
      />,
    );
  }

  function chooseType() {
    fireEvent.change(screen.getByLabelText("flags:dialog.type"), {
      target: { value: "type-blocked" },
    });
  }

  it("uses one combined target selector for users and teams", () => {
    renderDialog();

    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.queryByLabelText("flags:dialog.targetTeam")).toBeNull();
  });

  it("refuses to submit when neither a user nor a team is targeted", () => {
    renderDialog();
    chooseType();
    fireEvent.click(screen.getByText("flags:dialog.submit"));

    expect(createTaskFlagMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(
      "flags:dialog.errors.noTarget",
    );
  });

  it("submits a user-targeted flag with exactly one target", () => {
    renderDialog();
    chooseType();
    fireEvent.click(screen.getByLabelText("flags:dialog.targetUser"));
    fireEvent.click(screen.getByRole("option", { name: /User B/ }));
    fireEvent.click(screen.getByText("flags:dialog.submit"));

    expect(createTaskFlagMock).toHaveBeenCalledWith({
      taskId: "task-1",
      flagTypeId: "type-blocked",
      targetUserId: "user-b",
      targetTeamId: null,
      note: null,
    });
  });
});

describe("FlagDialog resolve", () => {
  it("resolves the flag by id and shows who raised it", () => {
    setFlags([activeFlag]);
    render(<FlagDialog taskId="task-1" boardId="board-1" />);

    expect(
      screen.getByText(
        'flags:dialog.raisedBy:{"who":"User A","target":"User B"}',
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByText("flags:dialog.unflag"));

    expect(resolveTaskFlagMock).toHaveBeenCalledWith({
      flagId: "flag-1",
      taskId: "task-1",
    });
  });

  it("shows who unflagged a resolved flag in the history", () => {
    setFlags([
      {
        ...activeFlag,
        resolvedAt: "2026-07-31T01:00:00.000Z",
        resolvedBy: "user-b",
        resolvedByName: "User B",
      },
    ]);
    render(<FlagDialog taskId="task-1" boardId="board-1" />);

    expect(
      screen.getByText('flags:dialog.resolvedBy:{"who":"User B"}'),
    ).toBeTruthy();
  });
});
