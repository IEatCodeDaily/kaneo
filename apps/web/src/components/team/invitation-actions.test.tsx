import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resend: vi.fn(async () => undefined),
  canInvite: true,
}));
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, o?: { defaultValue?: string }) => o?.defaultValue ?? key,
  }),
}));
vi.mock(
  "@/hooks/mutations/organization-member/use-invite-organization-member",
  () => ({ default: () => ({ mutateAsync: mocks.resend, isPending: false }) }),
);
vi.mock("@/hooks/mutations/organization-member/use-cancel-invitation", () => ({
  default: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock(
  "@/hooks/mutations/organization-member/use-delete-organization-member",
  () => ({ default: () => ({ mutateAsync: vi.fn(), isPending: false }) }),
);
vi.mock(
  "@/hooks/mutations/organization-member/use-update-organization-member-role",
  () => ({ default: () => ({ mutateAsync: vi.fn() }) }),
);
vi.mock("@/hooks/queries/organization/use-organization-roles", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-organization-permission", () => ({
  useOrganizationPermission: () => ({
    canManageTeam: () => false,
    canRemoveMembers: () => false,
    canInviteUsers: () => mocks.canInvite,
  }),
}));
vi.mock("../providers/auth-provider/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "me" } }),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import MembersTable from "./members-table";

afterEach(() => {
  cleanup();
  mocks.resend.mockClear();
  mocks.canInvite = true;
});
const invitation = {
  id: "i1",
  email: "user@example.com",
  role: "member",
  status: "pending",
  expiresAt: "2020-01-01T00:00:00Z",
};
it("labels expired invitations and resends with the original role", async () => {
  render(
    <MembersTable
      organizationId="org"
      users={[]}
      invitations={[invitation] as never}
    />,
  );
  expect(screen.getByText("Expired")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Resend" }));
  await waitFor(() =>
    expect(mocks.resend).toHaveBeenCalledWith({
      organizationId: "org",
      email: "user@example.com",
      role: "member",
      resend: true,
    }),
  );
});
it("shows an Agent badge only for explicit principal kind", () => {
  render(
    <MembersTable
      organizationId="org"
      users={
        [
          {
            id: "m",
            userId: "bot",
            role: "member",
            user: { id: "bot", name: "Release bot", email: "bot@example.test" },
          },
        ] as never
      }
      invitations={[]}
      principalKinds={new Map([["bot", "agent"]])}
    />,
  );
  expect(screen.getByText("team:agentManager.agentBadge")).toBeTruthy();
});
it("hides invitation mutations from viewers", () => {
  mocks.canInvite = false;
  render(
    <MembersTable
      organizationId="org"
      users={[]}
      invitations={[invitation] as never}
    />,
  );
  expect(screen.queryByRole("button", { name: "Resend" })).toBeNull();
});
