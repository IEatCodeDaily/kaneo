import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectTicketPicker } from "./project-ticket-picker";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const addMutate = vi.fn();
const removeMutate = vi.fn();

vi.mock("@/hooks/mutations/project/use-add-project-ticket", () => ({
  default: () => ({ mutate: addMutate }),
}));

vi.mock("@/hooks/mutations/project/use-remove-project-ticket", () => ({
  default: () => ({ mutate: removeMutate }),
}));

afterEach(() => {
  cleanup();
  addMutate.mockClear();
  removeMutate.mockClear();
});

const ticket = {
  id: "task-1",
  boardId: "board-1",
  boardSlug: "delivery",
  boardName: "Delivery",
  number: 1,
  key: "delivery-1",
  title: "Ship it",
  status: "to-do",
  priority: "high",
  archivedAt: null,
  rank: 0,
  addedAt: "2026-08-27T00:00:00.000Z",
  addedBy: "user-1",
};

describe("ProjectTicketPicker", () => {
  it("posts ticket membership and removes scoped tickets without optimistic changes", () => {
    render(<ProjectTicketPicker projectId="project-1" tickets={[ticket]} />);

    const input = screen.getByLabelText("projects:tickets.add");
    fireEvent.change(input, { target: { value: "task-2" } });
    fireEvent.click(screen.getByText("projects:tickets.add"));
    expect(addMutate).toHaveBeenCalledWith({
      id: "project-1",
      taskId: "task-2",
    });

    fireEvent.click(screen.getByText("projects:tickets.remove"));
    expect(removeMutate).toHaveBeenCalledWith({
      id: "project-1",
      taskId: "task-1",
    });

    // No fabricated ticket list: the scoped ticket remains as passed in.
    expect(screen.getByText("delivery-1")).toBeInTheDocument();
  });
});
