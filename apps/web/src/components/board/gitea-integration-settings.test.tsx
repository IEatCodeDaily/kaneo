import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GiteaIntegrationSettings } from "./gitea-integration-settings";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  t: (key: string) => key,
}));
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: mocks.t }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/hooks/queries/gitea-integration/use-get-gitea-integration", () => ({
  default: () => ({ data: null }),
}));
vi.mock(
  "@/hooks/mutations/gitea-integration/use-create-gitea-integration",
  () => ({
    useCreateGiteaIntegration: () => ({ mutateAsync: mocks.create }),
    useDeleteGiteaIntegration: () => ({ mutateAsync: vi.fn() }),
    useVerifyGiteaAccess: () => ({ mutateAsync: mocks.verify }),
  }),
);
vi.mock("@/hooks/mutations/gitea-integration/use-import-gitea-issues", () => ({
  default: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock(
  "@/hooks/mutations/gitea-integration/use-update-gitea-integration",
  () => ({ useUpdateGiteaIntegration: () => ({ mutateAsync: vi.fn() }) }),
);
vi.mock("@/fetchers/gitea-integration/list-gitea-repositories", () => ({
  default: mocks.list,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("renders board settings and verifies credentials without a legacy Project identifier", async () => {
  mocks.verify.mockResolvedValue({
    isInstalled: true,
    hasRequiredPermissions: true,
    message: "Verified",
  });
  mocks.list.mockResolvedValue({ repositories: [] });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <GiteaIntegrationSettings boardId="board-current" />
    </QueryClientProvider>,
  );
  const values = ["https://gitea.example", "dummy-token", "owner", "repo"];
  const inputs = document.querySelectorAll("form input");
  expect(inputs).toHaveLength(4);
  inputs.forEach((input, index) => {
    fireEvent.change(input, { target: { value: values[index] } });
  });
  const verify = screen.getByRole("button", {
    name: "settings:giteaIntegration.verify",
  });
  await waitFor(() => expect(verify).not.toBeDisabled());
  fireEvent.click(verify);
  await waitFor(() =>
    expect(mocks.verify).toHaveBeenCalledWith({
      baseUrl: values[0],
      accessToken: values[1],
      repositoryOwner: values[2],
      repositoryName: values[3],
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "settings:giteaIntegration.connect" }),
  );
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith({
      boardId: "board-current",
      data: {
        baseUrl: values[0],
        accessToken: values[1],
        repositoryOwner: values[2],
        repositoryName: values[3],
      },
    }),
  );
});

it("browses repositories using only provider credentials", async () => {
  mocks.list.mockResolvedValue({ repositories: [] });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <GiteaIntegrationSettings boardId="board-current" />
    </QueryClientProvider>,
  );
  const inputs = document.querySelectorAll("form input");
  fireEvent.change(inputs[0], { target: { value: "https://gitea.example" } });
  fireEvent.change(inputs[1], { target: { value: "dummy-token" } });
  fireEvent.click(
    screen.getByRole("button", { name: "settings:giteaIntegration.browse" }),
  );
  await waitFor(() =>
    expect(mocks.list).toHaveBeenCalledWith({
      baseUrl: "https://gitea.example",
      accessToken: "dummy-token",
    }),
  );
});
