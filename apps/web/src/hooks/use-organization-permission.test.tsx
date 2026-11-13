import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { useOrganizationPermission } from "./use-organization-permission";

const hasPermission = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    organization: { hasPermission: (a: unknown) => hasPermission(a) },
  },
}));
vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { id: "org-1" } }),
}));
vi.mock(
  "@/hooks/queries/organization-members/use-active-organization-member",
  () => ({
    useGetActiveOrganizationMember: () => ({ data: { role: "owner" } }),
  }),
);

it("never caches a failed permission check as denied", async () => {
  // First round: network failure on every check. Then the server answers.
  let failing = true;
  hasPermission.mockImplementation(async () => {
    if (failing) throw new TypeError("NetworkError when attempting to fetch");
    return { data: { success: true }, error: null };
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useOrganizationPermission(), { wrapper });

  await waitFor(() => expect(hasPermission).toHaveBeenCalled());
  expect(result.current.canManageTasks()).toBe(false);
  failing = false;
  await waitFor(() => expect(result.current.canManageTasks()).toBe(true), {
    timeout: 5_000,
  });
  expect(result.current.canManageLabels()).toBe(true);
}, 10_000);
