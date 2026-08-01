import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TaskSyncedIssueProperty from "./task-synced-issue-property";

afterEach(cleanup);

describe("TaskSyncedIssueProperty (#75)", () => {
  it("renders no synced-issue remark in the properties sidebar", () => {
    const { container } = render(<TaskSyncedIssueProperty taskId="task-1" />);

    expect(container.textContent).toBe("");
  });

  it("renders nothing even when asked for the labelled variant", () => {
    const { container } = render(
      <TaskSyncedIssueProperty showLabel taskId="task-1" />,
    );

    expect(container.querySelectorAll("a").length).toBe(0);
  });
});
