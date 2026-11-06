import { expect, it } from "vitest";
import { ticketDueState } from "./my-tasks-view";

it("treats calendar dates locally and ignores completed work", () => {
  const today = new Date(2026, 10, 5);
  expect(ticketDueState("2026-11-04", false, today)).toBe("overdue");
  expect(ticketDueState("2026-11-05", false, today)).toBe("soon");
  expect(ticketDueState("2026-11-12", false, today)).toBe("soon");
  expect(ticketDueState("2026-11-13", false, today)).toBe(null);
  expect(ticketDueState("2026-11-04", true, today)).toBe(null);
  expect(ticketDueState("bad", false, today)).toBe(null);
});
