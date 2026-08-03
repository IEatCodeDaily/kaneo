import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CreateTaskAction from "./create-task-action";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: () => "Create ticket" }),
}));
vi.mock("@/components/shared/modals/create-task-modal", () => ({
  default: ({
    open,
    boardId,
    status,
    onClose,
  }: {
    open: boolean;
    boardId: string;
    status?: "planned";
    onClose: () => void;
  }) =>
    open ? (
      <div
        data-testid="create-task-modal"
        data-board-id={boardId}
        data-status={status}
      >
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

afterEach(cleanup);

describe("CreateTaskAction", () => {
  it("opens one create-ticket modal for the requested board", async () => {
    render(<CreateTaskAction boardId="board-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Create ticket" }));
    const modal = await screen.findByTestId("create-task-modal");
    expect(modal).toHaveAttribute("data-board-id", "board-1");
    expect(modal).not.toHaveAttribute("data-status");
  });

  it("preserves Backlog planned-ticket semantics", async () => {
    render(<CreateTaskAction boardId="board-1" status="planned" />);
    fireEvent.click(screen.getByRole("button", { name: "Create ticket" }));
    expect(await screen.findByTestId("create-task-modal")).toHaveAttribute(
      "data-status",
      "planned",
    );
  });
});
