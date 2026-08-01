import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Task from "@/types/task";
import TaskHoverPreview from "./task-hover-preview";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

afterEach(cleanup);

const task = {
  id: "task-1",
  number: 7,
  title: "Draggable card",
  status: "to-do",
  priority: "low",
  description: "",
  labels: [],
} as unknown as Task;

function Card({ isDragging = false }: { isDragging?: boolean }) {
  return (
    <TaskHoverPreview boardSlug="KFL" isDragging={isDragging} task={task}>
      <div data-testid="card">card</div>
    </TaskHoverPreview>
  );
}

describe("TaskHoverPreview drag lifecycle", () => {
  it("keeps its trigger mounted while the active card is dragging", () => {
    render(<Card isDragging />);
    expect(screen.getByTestId("card")).toHaveAttribute(
      "data-slot",
      "preview-card-trigger",
    );
  });

  it("keeps the same trigger mounted after drop", () => {
    const { rerender } = render(<Card isDragging />);
    const trigger = screen.getByTestId("card");
    rerender(<Card />);
    expect(screen.getByTestId("card")).toBe(trigger);
  });
});
