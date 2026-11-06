import { expect, it } from "vitest";
import { summarizeTicketStatuses } from "./my-tasks-view";

it("summarizes loaded custom status slugs without inventing totals", () => {
  expect(
    summarizeTicketStatuses([
      { status: "to-do", columnName: "Queued" },
      { status: "to-do", columnName: "Queued" },
      { status: "qa-review", columnName: "Quality check" },
    ]),
  ).toEqual([
    { slug: "to-do", name: "Queued", count: 2, percent: 67 },
    { slug: "qa-review", name: "Quality check", count: 1, percent: 33 },
  ]);
  expect(summarizeTicketStatuses([])).toEqual([]);
});
