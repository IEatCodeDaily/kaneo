import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TaskLabelsRow from "./task-labels-row";

afterEach(cleanup);

describe("TaskLabelsRow", () => {
  it("spans labels horizontally beside their heading without duplicating them", () => {
    render(
      <TaskLabelsRow label="Labels">
        <span>Backend</span>
        <span>Urgent</span>
      </TaskLabelsRow>,
    );

    const row = screen.getByTestId("task-labels-row");
    const list = screen.getByTestId("task-labels-list");

    expect(row).toHaveClass("flex", "items-center", "min-w-0");
    expect(list).toHaveClass("flex-1", "flex-wrap", "min-w-0");
    expect(screen.getAllByText("Backend")).toHaveLength(1);
    expect(screen.getAllByText("Urgent")).toHaveLength(1);
  });
});
