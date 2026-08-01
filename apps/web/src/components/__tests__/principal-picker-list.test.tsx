import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PrincipalPickerList from "@/components/principal-picker-list";

/**
 * #107 (third round), verbatim:
 *   "use the same selector as assignment selector. very compact and useful.
 *    at the same time, update the assignment selector to show the member/team
 *    text aligned to the right instead."
 *
 * The flag dialog previously used the bulky PrincipalSelector combobox while
 * assignment used a compact list — two pickers for the same job. This is that
 * compact list, extracted so both surfaces share one control.
 */

afterEach(cleanup);

const OPTIONS = [
  { type: "user" as const, value: "user-a", label: "Ada Lovelace" },
  { type: "user" as const, value: "user-b", label: "Grace Hopper" },
  { type: "team" as const, value: "team-1", label: "Platform" },
];

describe("PrincipalPickerList (#107)", () => {
  it("lists members and teams as rows in place, with no nested combobox", () => {
    render(<PrincipalPickerList onSelect={vi.fn()} options={OPTIONS} />);

    expect(screen.getByTestId("principal-option-user-user-a")).toBeTruthy();
    expect(screen.getByTestId("principal-option-team-team-1")).toBeTruthy();
    // Compact: the options are visible immediately, not behind a trigger.
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("pushes the member/team kind to the right edge of the row", () => {
    render(<PrincipalPickerList onSelect={vi.fn()} options={OPTIONS} />);

    const kinds = screen.getAllByTestId("principal-option-kind");
    // `ml-auto` is what right-aligns it; assert the whole token, not a substring.
    for (const kind of kinds) {
      expect(Array.from(kind.classList)).toContain("ml-auto");
    }
    expect(kinds.map((k) => k.textContent)).toEqual([
      "Member",
      "Member",
      "Team",
    ]);
  });

  it("reports the chosen principal to the caller", () => {
    const onSelect = vi.fn();
    render(<PrincipalPickerList onSelect={onSelect} options={OPTIONS} />);

    fireEvent.click(screen.getByTestId("principal-option-team-team-1"));

    expect(onSelect).toHaveBeenCalledWith(OPTIONS[2]);
  });

  it("filters by name as the user searches", () => {
    render(<PrincipalPickerList onSelect={vi.fn()} options={OPTIONS} />);

    fireEvent.change(screen.getByLabelText("Search people and teams"), {
      target: { value: "grace" },
    });

    expect(screen.getByTestId("principal-option-user-user-b")).toBeTruthy();
    expect(screen.queryByTestId("principal-option-user-user-a")).toBeNull();
    expect(screen.queryByTestId("principal-option-team-team-1")).toBeNull();
  });

  it("only renders a clear row when the caller asks for one", () => {
    const { unmount } = render(
      <PrincipalPickerList onSelect={vi.fn()} options={OPTIONS} />,
    );
    // The flag target is mandatory, so it passes no clearLabel.
    expect(screen.queryByText("Unassigned")).toBeNull();
    unmount();

    render(
      <PrincipalPickerList
        clearLabel="Unassigned"
        onSelect={vi.fn()}
        options={OPTIONS}
      />,
    );
    expect(screen.getByText("Unassigned")).toBeTruthy();
  });

  it("clears the selection when the clear row is chosen", () => {
    const onSelect = vi.fn();
    render(
      <PrincipalPickerList
        clearLabel="Unassigned"
        onSelect={onSelect}
        options={OPTIONS}
        selected={{ type: "user", value: "user-a" }}
      />,
    );

    fireEvent.click(screen.getByText("Unassigned"));

    expect(onSelect).toHaveBeenCalledWith();
  });

  it("shows an empty message when a search matches nothing", () => {
    render(<PrincipalPickerList onSelect={vi.fn()} options={OPTIONS} />);

    fireEvent.change(screen.getByLabelText("Search people and teams"), {
      target: { value: "nobody" },
    });

    expect(screen.getByText("No people or teams found")).toBeTruthy();
  });
});
