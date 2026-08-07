import { describe, expect, it } from "vitest";
import { getTaskUrl } from "../../../apps/api/src/utils/task-url";

describe("getTaskUrl", () => {
  it("links integration-created tasks through their organization route", () => {
    expect(
      getTaskUrl("https://kaneo.example/", "org-1", "board-2", "task-3"),
    ).toBe(
      "https://kaneo.example/dashboard/organization/org-1/board/board-2/task/task-3",
    );
  });
});
