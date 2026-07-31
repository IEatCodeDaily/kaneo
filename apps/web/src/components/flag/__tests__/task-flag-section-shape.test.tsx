import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #69 regression: the task detail route crashed with "l.map is not a function".
 *
 * TaskFlagSection treated useGetActiveOrganizationMembers' result as an array,
 * but authClient.organization.listMembers resolves to { members, total }. The
 * agent's own tests passed because they mocked the hook AS an array, so the
 * mock disagreed with the real client and hid the crash.
 *
 * This suite mocks the REAL shape on purpose.
 */
const memberData = {
  members: [
    { userId: "u-1", user: { name: "Ada", email: "ada@example.com" } },
    { userId: "u-2", user: { email: "grace@example.com" } },
  ],
  total: 2,
};

vi.mock(
  "@/hooks/queries/organization-members/use-get-active-organization-members",
  () => ({
    useGetActiveOrganizationMembers: () => ({ data: memberData }),
  }),
);

vi.mock("@/hooks/queries/flag/use-get-task-flags", () => ({
  default: () => ({ data: [] }),
}));

vi.mock("@/hooks/queries/flag/use-get-board-flag-types", () => ({
  default: () => ({ data: [] }),
}));

vi.mock("@/hooks/mutations/flag/use-create-task-flag", () => ({
  default: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/mutations/flag/use-resolve-task-flag", () => ({
  default: () => ({ mutate: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// TaskFlagSection imports the dialog primitive, which transitively boots the
// real i18n instance and blows up under vitest. Stub the primitives; this
// suite is about the member payload shape, not the dialog chrome.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children?: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

import TaskFlagSection from "@/components/flag/task-flag-section";

afterEach(cleanup);

describe("TaskFlagSection member shape (#69)", () => {
  it("renders against the real { members, total } payload without crashing", () => {
    // Before the fix this threw "members.map is not a function" and React
    // unmounted the whole task detail route.
    expect(() =>
      render(
        <TaskFlagSection
          taskId="task-1"
          boardId="board-1"
          organizationId="org-1"
        />,
      ),
    ).not.toThrow();

    expect(screen.getByText("flags:title")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /flags:actions\.flag/ }),
    ).toBeTruthy();
  });

  it("survives an undefined payload while the query is in flight", () => {
    vi.doMock(
      "@/hooks/queries/organization-members/use-get-active-organization-members",
      () => ({
        useGetActiveOrganizationMembers: () => ({ data: undefined }),
      }),
    );

    expect(() =>
      render(
        <TaskFlagSection
          taskId="task-1"
          boardId="board-1"
          organizationId="org-1"
        />,
      ),
    ).not.toThrow();
  });
});
