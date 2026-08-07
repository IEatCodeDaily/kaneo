import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TaskTemplateMenu from "./task-template-menu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/fetchers/get-api-url", () => ({
  getApiUrl: (path: string) => path,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

const data = {
  title: "Bug: ",
  description: "Steps",
  priority: "high",
  startDate: null,
  dueDate: null,
};

describe("TaskTemplateMenu (#118)", () => {
  it("applies an organization template", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ id: "t1", name: "Bug", data }],
      }),
    );
    const onApply = vi.fn();
    render(<TaskTemplateMenu organizationId="org-1" onApply={onApply} />, {
      wrapper,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:templates.label" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Bug" }));
    expect(onApply).toHaveBeenCalledWith({ id: "t1", name: "Bug", data });
  });

  it("keeps template management out of the apply menu", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);
    render(<TaskTemplateMenu organizationId="org-1" onApply={vi.fn()} />, {
      wrapper,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:templates.label" }),
    );
    expect(
      await screen.findByText("tasks:templates.empty"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("tasks:templates.name"),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
