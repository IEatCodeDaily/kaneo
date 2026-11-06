import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import TaskDetailsContent from "./task-details-content";

let canEdit = false;
vi.mock("@/hooks/use-organization-permission", () => ({
  useOrganizationPermission: () => ({ canManageTasks: () => canEdit }),
}));
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  default: () => ({ user: { id: "viewer" } }),
}));
vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: () => ({ data: {} }),
}));
vi.mock("@/hooks/queries/activity/use-get-activities-by-task-id", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/hooks/queries/task-relation/use-get-task-relations", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/components/activity", () => ({ default: () => null }));
vi.mock("@/components/activity/comment-input", () => ({
  default: () => <div data-testid="comment-composer" />,
}));
vi.mock("./task-title", () => ({ default: () => <h2>Ticket title</h2> }));
vi.mock("./task-description", () => ({ default: () => null }));
vi.mock("./task-description-history", () => ({ default: () => null }));
vi.mock("./task-subtasks", () => ({ default: () => null }));
vi.mock("./task-relations", () => ({ default: () => null }));
vi.mock("./task-resources", () => ({ default: () => null }));
afterEach(cleanup);

it("retains ticket content but hides comment creation until editing is permitted", () => {
  canEdit = false;
  const props = { taskId: "t1", boardId: "b1", organizationId: "o1" };
  const { rerender } = render(<TaskDetailsContent {...props} />);
  expect(screen.getByText("Ticket title")).toBeVisible();
  expect(screen.queryByTestId("comment-composer")).toBeNull();
  canEdit = true;
  rerender(<TaskDetailsContent {...props} />);
  expect(screen.getByTestId("comment-composer")).toBeVisible();
});
