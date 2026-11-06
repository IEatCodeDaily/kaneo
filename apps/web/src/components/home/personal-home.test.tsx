import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PersonalHome from "./personal-home";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/components/common/organization-layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/format", () => ({ formatRelativeTime: () => "now" }));
vi.mock("@/components/page-title", () => ({ default: () => null }));
vi.mock("@/components/notification/notification-dropdown", () => ({
  getNotificationTitle: () => "Event",
}));
vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { id: "o1", slug: "acme" } }),
}));
vi.mock("@/hooks/queries/task/use-infinite-my-tasks", () => ({
  default: () => ({
    data: {
      pages: [
        [
          {
            id: "t1",
            title: "Finish review",
            number: 1,
            boardId: "b1",
            boardSlug: "ENG",
            boardName: "Engineering",
            dueDate: null,
            labels: [],
          },
        ],
      ],
    },
    hasNextPage: true,
  }),
}));
vi.mock("@/hooks/queries/board/use-get-boards", () => ({
  default: () => ({
    data: [
      {
        id: "b1",
        slug: "ENG",
        name: "Engineering",
        statistics: { completionPercentage: 25, totalTasks: 4 },
      },
    ],
  }),
}));
vi.mock("@/hooks/queries/notification/use-get-notifications", () => ({
  default: () => ({ data: [] }),
}));
afterEach(cleanup);
it("offers a personal overview without replacing the Boards portfolio", () => {
  render(<PersonalHome />);
  expect(screen.getByText("Finish review")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "home:allBoards" }),
  ).toBeInTheDocument();
  expect(screen.getByText("home:partialTasks")).toBeInTheDocument();
  expect(screen.getByText("25%")).toBeInTheDocument();
});
