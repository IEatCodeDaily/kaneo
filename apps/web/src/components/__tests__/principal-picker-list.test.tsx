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

  /**
   * KFL-160: the picker must show three labelled groups — Users / Agents /
   * Teams — so agent principals are visually distinct from human members.
   * Previously agents were rendered identically to humans (the kind label was
   * a binary user/team ternary, so agents fell through to "Member").
   */
  describe("KFL-160 grouping", () => {
    const GROUPED = [
      { type: "user" as const, value: "user-a", label: "Ada Lovelace" },
      { type: "agent" as const, value: "agent-1", label: "Codex Bot" },
      { type: "team" as const, value: "team-1", label: "Platform" },
      { type: "agent" as const, value: "agent-2", label: "Review Bot" },
      { type: "user" as const, value: "user-b", label: "Grace Hopper" },
    ];

    it("renders three labelled groups in Users / Agents / Teams order", () => {
      render(<PrincipalPickerList onSelect={vi.fn()} options={GROUPED} />);

      const headings = screen.getAllByTestId(/^principal-group-heading-/);
      expect(headings.map((h) => h.getAttribute("data-testid"))).toEqual([
        "principal-group-heading-user",
        "principal-group-heading-agent",
        "principal-group-heading-team",
      ]);
      expect(headings.map((h) => h.textContent)).toEqual([
        "Users",
        "Agents",
        "Teams",
      ]);
    });

    it("puts each principal under its own group heading", () => {
      render(<PrincipalPickerList onSelect={vi.fn()} options={GROUPED} />);

      expect(screen.getByTestId("principal-option-agent-agent-1")).toBeTruthy();
      expect(screen.getByTestId("principal-option-agent-agent-2")).toBeTruthy();

      // Rows are ordered by group, not by the caller's array order.
      const rows = screen.getAllByTestId(/^principal-option-(user|agent|team)-/);
      expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
        "principal-option-user-user-a",
        "principal-option-user-user-b",
        "principal-option-agent-agent-1",
        "principal-option-agent-agent-2",
        "principal-option-team-team-1",
      ]);
    });

    it("labels an agent row Agent, not Member", () => {
      render(<PrincipalPickerList onSelect={vi.fn()} options={GROUPED} />);

      const kinds = screen.getAllByTestId("principal-option-kind");
      expect(kinds.map((k) => k.textContent)).toEqual([
        "Member",
        "Member",
        "Agent",
        "Agent",
        "Team",
      ]);
    });

    it("hides a group heading when that group has no options", () => {
      render(
        <PrincipalPickerList
          onSelect={vi.fn()}
          options={[
            { type: "user", value: "user-a", label: "Ada Lovelace" },
            { type: "team", value: "team-1", label: "Platform" },
          ]}
        />,
      );

      expect(screen.getByTestId("principal-group-heading-user")).toBeTruthy();
      expect(screen.queryByTestId("principal-group-heading-agent")).toBeNull();
      expect(screen.getByTestId("principal-group-heading-team")).toBeTruthy();
    });

    it("searches across every group and drops groups that no longer match", () => {
      render(<PrincipalPickerList onSelect={vi.fn()} options={GROUPED} />);

      fireEvent.change(screen.getByLabelText("Search people and teams"), {
        target: { value: "bot" },
      });

      expect(screen.getByTestId("principal-option-agent-agent-1")).toBeTruthy();
      expect(screen.getByTestId("principal-option-agent-agent-2")).toBeTruthy();
      expect(screen.queryByTestId("principal-option-user-user-a")).toBeNull();
      expect(screen.queryByTestId("principal-group-heading-user")).toBeNull();
      expect(screen.queryByTestId("principal-group-heading-team")).toBeNull();
      expect(screen.getByTestId("principal-group-heading-agent")).toBeTruthy();
    });

    it("selects an agent and reports it back with type agent", () => {
      const onSelect = vi.fn();
      render(<PrincipalPickerList onSelect={onSelect} options={GROUPED} />);

      fireEvent.click(screen.getByTestId("principal-option-agent-agent-1"));

      expect(onSelect).toHaveBeenCalledWith(GROUPED[1]);
    });

    it("marks the selected agent as checked without matching a same-id user", () => {
      render(
        <PrincipalPickerList
          onSelect={vi.fn()}
          options={GROUPED}
          selected={{ type: "agent", value: "agent-1" }}
        />,
      );

      const row = screen.getByTestId("principal-option-agent-agent-1");
      expect(row.querySelector("svg.lucide-check")).toBeTruthy();
    });
  });

  /**
   * #107 (fourth round), verbatim: "Bound the user/team selector. make it
   * scrollable. right now it'll extend infinitely."
   *
   * With 60 members the row container must scroll rather than grow, otherwise
   * the popover hosting it runs off the viewport.
   */
  it("bounds the option list and scrolls instead of growing", () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      type: "user" as const,
      value: `user-${index}`,
      label: `Member ${index}`,
    }));

    render(<PrincipalPickerList onSelect={vi.fn()} options={many} />);

    const row = screen.getByTestId("principal-option-user-user-0");
    const list = row.parentElement as HTMLElement;
    const classes = Array.from(list.classList);

    // Assert the whole tokens: a max height AND overflow handling. Either one
    // alone still lets the container stretch or clip.
    expect(classes).toContain("overflow-y-auto");
    expect(classes.some((token) => token.startsWith("max-h-"))).toBe(true);
  });
});
