import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const permissions = vi.hoisted(() => ({ create: false }));
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/hooks/use-organization-permission", () => ({
  useOrganizationPermission: () => ({
    canCreateTasks: () => permissions.create,
  }),
}));
vi.mock("@/hooks/mutations/task/use-export-tasks", () => ({
  default: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/mutations/task/use-import-tasks", () => ({
  default: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { TasksImportExport } from "./tasks-import-export";

afterEach(cleanup);
it("hides ticket import from viewers but retains read-only export", () => {
  permissions.create = false;
  render(<TasksImportExport board={{ id: "b", slug: "KFL" } as never} />);
  expect(
    screen.queryByRole("button", {
      name: "settings:tasksImportExport.importTasks",
    }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "settings:tasksImportExport.exportTasks",
    }),
  ).toBeInTheDocument();
});
it("allows ticket import with create permission", () => {
  permissions.create = true;
  render(<TasksImportExport board={{ id: "b", slug: "KFL" } as never} />);
  expect(
    screen.getByRole("button", {
      name: "settings:tasksImportExport.importTasks",
    }),
  ).toBeInTheDocument();
});
