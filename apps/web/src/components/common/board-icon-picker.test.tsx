import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BoardIconPicker from "./board-icon-picker";

describe("BoardIconPicker", () => {
  it("filters icons accessibly and selects the matching icon", () => {
    const onValueChange = vi.fn();

    render(
      <BoardIconPicker
        onValueChange={onValueChange}
        searchPlaceholder="Search icons"
        triggerLabel="Choose icon"
        value="Layout"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose icon" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search icons" }), {
      target: { value: "rocket" },
    });

    expect(screen.getByRole("button", { name: "Rocket" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Layout" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rocket" }));
    expect(onValueChange).toHaveBeenCalledWith("Rocket");
  });
});
