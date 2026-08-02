import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
    render(
      <TaskTemplateMenu
        organizationId="org-1"
        current={data}
        onApply={onApply}
      />,
      { wrapper },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:templates.label" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Bug" }));
    expect(onApply).toHaveBeenCalledWith({ id: "t1", name: "Bug", data });
  });

  it("saves the current values as a named template", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "t1" }) })
      .mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <TaskTemplateMenu
        organizationId="org-1"
        current={data}
        onApply={vi.fn()}
      />,
      { wrapper },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:templates.label" }),
    );
    fireEvent.change(await screen.findByLabelText("tasks:templates.name"), {
      target: { value: "Bug" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:templates.save" }),
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, options]) => options?.method === "POST"),
      ).toBe(true),
    );
    const post = fetchMock.mock.calls.find(
      ([, request]) => request?.method === "POST",
    );
    expect(post).toBeDefined();
    if (!post) throw new Error("Template POST missing");
    expect(JSON.parse(post[1].body)).toEqual({ name: "Bug", data });
  });
});
