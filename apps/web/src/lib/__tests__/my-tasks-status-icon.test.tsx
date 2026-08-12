import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getColumnIcon } from "@/lib/column";

/**
 * #120 "My Task should show status icon", verbatim:
 *   "It's easier to ingest/process by human if it's shown the icon and colour.
 *    muted text really should only be for 'extra information'."
 *
 * My Tasks rendered the column name as muted text. It now renders the board's
 * own status icon — the same `getColumnIcon` the board and toolbar use, so a
 * status looks identical everywhere — with the name kept as the tooltip rather
 * than duplicated as a second visible label.
 */

afterEach(cleanup);

/** Mirrors the My Tasks row usage: columnId, isFinal, custom icon name. */
function renderStatus(
  columnId: string,
  isFinal: boolean,
  iconName: string | null,
  columnName: string,
) {
  return render(
    <span data-testid="my-task-status-icon" title={columnName}>
      {getColumnIcon(columnId, isFinal, iconName)}
    </span>,
  );
}

describe("My Tasks status icon (#120)", () => {
  it("renders an icon rather than the status as text", () => {
    const { container } = renderStatus(
      "in-progress",
      false,
      null,
      "In Progress",
    );

    expect(container.querySelector("svg")).not.toBeNull();
    // The name must not appear as a visible second label.
    expect(screen.queryByText("In Progress")).toBeNull();
  });

  it("keeps the status name reachable as a tooltip", () => {
    renderStatus("to-do", false, null, "To Do");

    expect(
      screen.getByTestId("my-task-status-icon").getAttribute("title"),
    ).toBe("To Do");
  });

  it("carries a status colour, not just a muted glyph", () => {
    const { container } = renderStatus(
      "in-progress",
      false,
      null,
      "In Progress",
    );

    const svg = container.querySelector("svg");
    const classes = Array.from(svg?.classList ?? []);
    // Colour is what makes it scannable; a muted-only icon defeats the ticket.
    expect(classes).not.toContain("text-muted-foreground");
  });

  it("uses distinct icons for different statuses", () => {
    const { container: todo } = renderStatus("to-do", false, null, "To Do");
    const todoHtml = todo.innerHTML;
    cleanup();
    const { container: done } = renderStatus("done", true, null, "Done");

    expect(done.innerHTML).not.toBe(todoHtml);
  });

  it("is keyed on the column slug, not the column CUID", () => {
    // The live regression: My Tasks passed `task.columnId` (a CUID like
    // "buwmkvhzhd2wn45xroaikqhy"), which matches no colour entry, so every
    // status rendered the same muted grey. The slug lives on `task.status`.
    const { container: bySlug } = renderStatus(
      "in-review",
      false,
      null,
      "In Review",
    );
    const slugClasses = Array.from(
      bySlug.querySelector("svg")?.classList ?? [],
    );
    cleanup();
    const { container: byCuid } = renderStatus(
      "buwmkvhzhd2wn45xroaikqhy",
      false,
      null,
      "In Review",
    );
    const cuidClasses = Array.from(
      byCuid.querySelector("svg")?.classList ?? [],
    );

    expect(slugClasses).not.toContain("text-muted-foreground");
    expect(cuidClasses).toContain("text-muted-foreground");
  });

  it("gives each status its own colour", () => {
    const seen = new Set<string>();
    for (const slug of ["to-do", "in-progress", "in-review", "done"]) {
      const { container } = renderStatus(slug, slug === "done", null, slug);
      const colour = Array.from(
        container.querySelector("svg")?.classList ?? [],
      ).find((c) => c.startsWith("text-"));
      expect(colour).toBeDefined();
      seen.add(colour as string);
      cleanup();
    }
    // Four statuses must not collapse onto one colour.
    expect(seen.size).toBe(4);
  });

  it("honours a column's configured custom icon", () => {
    const { container: def } = renderStatus("shipped", true, null, "Shipped");
    const defaultHtml = def.innerHTML;
    cleanup();
    const { container: custom } = renderStatus(
      "shipped",
      true,
      "Rocket",
      "Shipped",
    );

    // The API now sends columnIcon so a custom icon survives into My Tasks.
    expect(custom.innerHTML).not.toBe(defaultHtml);
  });
});
