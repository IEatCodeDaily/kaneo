import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import RepoTaskLinks from "./repo-task-links";

vi.mock("@/hooks/queries/board/use-get-boards", () => ({
  default: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/use-organization-permission", () => ({
  useOrganizationPermission: () => ({ canUpdateBoards: () => true }),
}));
afterEach(cleanup);

it("associates the visible Board label with the synced-ticket board input", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepoTaskLinks
        organizationId="org"
        repoId="repo"
        number={1}
        itemType="issues"
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByLabelText("Add Synced Ticket"));
  const input = screen.getByLabelText("Board for synced ticket");
  const label = screen.getByText("Board").closest("label");
  expect(label?.htmlFor).toBeTruthy();
  expect(label?.htmlFor).toBe(input.id);
  expect(label?.control).toBe(input);
});
