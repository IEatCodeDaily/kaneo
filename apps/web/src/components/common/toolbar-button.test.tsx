import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Filter } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarSearch } from "./toolbar-search";

afterEach(cleanup);

describe("resource toolbar controls", () => {
  it("keeps the accessible name, title, applied state and handlers when labels collapse", () => {
    const onClick = vi.fn();
    render(
      <ToolbarButton
        icon={<Filter />}
        label="Filter"
        badge={2}
        applied
        onClick={onClick}
        data-popup-open=""
      />,
    );
    const button = screen.getByRole("button", { name: "Filter" });
    expect(button).toHaveAttribute("title", "Filter");
    expect(button).toHaveAttribute("data-applied", "true");
    expect(button).toHaveAttribute("data-popup-open");
    expect(button.querySelector("[data-toolbar-label]")).toHaveClass(
      "hidden",
      "@3xl/toolbar:inline",
    );
    expect(button).toHaveClass(
      "h-7",
      "px-2",
      "text-xs",
      "data-popup-open:bg-primary-soft",
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("gives permanently icon-only controls a name and no label span", () => {
    render(<ToolbarButton icon={<Filter />} label="Options" iconOnly />);
    expect(
      screen
        .getByRole("button", { name: "Options" })
        .querySelector("[data-toolbar-label]"),
    ).toBeNull();
  });

  it("shares search chrome and reports typing and clearing", () => {
    const onChange = vi.fn();
    render(
      <ToolbarSearch
        label="Search rows"
        clearLabel="Clear"
        value="batch"
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Search rows" }), {
      target: { value: "housing" },
    });
    expect(onChange).toHaveBeenLastCalledWith("housing");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});
