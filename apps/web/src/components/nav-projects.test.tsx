import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
let pathname = "/dashboard/organization/acme/projects";
let activeOrganization: { id: string; slug: string; name: string } | undefined =
  {
    id: "org-1",
    slug: "acme",
    name: "Acme",
  };

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: activeOrganization }),
}));

vi.mock("@/hooks/queries/project/use-get-project-sidebar", () => ({
  default: () => ({
    data: [
      {
        id: "project-1",
        slug: "launch",
        name: "Launch",
        icon: "Rocket",
        color: "#3b82f6",
        progress: { completed: 3, eligible: 5, percent: 60 },
        leadTeam: { id: "team-1", name: "Platform" },
        resources: [
          {
            id: "link-board",
            resourceType: "board",
            resourceId: "board-1",
            resource: {
              id: "board-1",
              slug: "delivery",
              name: "Delivery",
              icon: "Layout",
            },
          },
          {
            id: "link-repo",
            resourceType: "repo",
            resourceId: "repo-1",
            resource: { id: "repo-1", slug: "api", name: "api", icon: null },
          },
          {
            id: "link-table",
            resourceType: "table",
            resourceId: "table-1",
            resource: {
              id: "table-1",
              slug: "risks",
              name: "Risks",
              icon: null,
            },
          },
        ],
      },
      {
        id: "project-2",
        slug: "later",
        name: "Later",
        icon: null,
        color: null,
        progress: { completed: 0, eligible: 0, percent: null },
        leadTeam: null,
        resources: [],
      },
    ],
  }),
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarGroup: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarGroupContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarMenu: ({ children }: { children: React.ReactNode }) => (
    <ul>{children}</ul>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => (
    <li>{children}</li>
  ),
  SidebarMenuButton: ({
    children,
    onClick,
    isActive,
    tooltip,
    className,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    isActive?: boolean;
    tooltip?: string;
    className?: string;
    [key: string]: unknown;
  }) => (
    <button
      type="button"
      aria-current={isActive || undefined}
      aria-label={tooltip}
      className={className}
      onClick={onClick}
      data-testid={props["data-testid"] as string | undefined}
    >
      {children}
    </button>
  ),
  SidebarMenuSub: ({ children }: { children: React.ReactNode }) => (
    <ul>{children}</ul>
  ),
  SidebarMenuSubItem: ({ children }: { children: React.ReactNode }) => (
    <li>{children}</li>
  ),
  SidebarMenuSubButton: ({
    children,
    onClick,
    isActive,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    isActive?: boolean;
    [key: string]: unknown;
  }) => (
    <button
      type="button"
      aria-label={props["aria-label"] as string | undefined}
      aria-current={isActive || undefined}
      aria-expanded={props["aria-expanded"] as boolean | undefined}
      onClick={onClick}
    >
      {children}
    </button>
  ),
}));

import { NavProjects } from "./nav-projects";

beforeEach(() => {
  localStorage.clear();
  navigate.mockClear();
  pathname = "/dashboard/organization/acme/projects";
  activeOrganization = { id: "org-1", slug: "acme", name: "Acme" };
});

afterEach(() => cleanup());

describe("Projects section navigation", () => {
  it("renders a non-collapsible canonical overview row with right-side Alpha and chevron", () => {
    render(<NavProjects />);

    const projects = screen.getByRole("button", { name: "Projects" });
    expect(projects.className).toContain("h-7");
    expect(projects.querySelector("svg")).toBeTruthy();
    expect(projects).toHaveTextContent("ProjectsAlpha");
    expect(projects).not.toHaveAttribute("aria-expanded");

    fireEvent.click(projects);
    expect(navigate).toHaveBeenCalledWith({
      to: "/dashboard/organization/$organizationSlug/projects",
      params: { organizationSlug: "acme" },
    });
  });
});

describe("NavProjects project tree (KFL-378)", () => {
  it("expands one Project into exactly Overview, Boards, Cycles, and Resources", () => {
    render(<NavProjects />);

    expect(screen.queryByText("Delivery")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand Launch" }));

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Boards")).toBeInTheDocument();
    expect(screen.getByText("Cycles")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resources" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("Delivery")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resources" }));
    expect(screen.getByRole("button", { name: "Boards" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tables" })).toBeInTheDocument();
    expect(screen.queryByText("Delivery")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Boards" }));
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Repos" }));
    expect(screen.getByText("api")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tables" }));
    expect(screen.getByText("Risks")).toBeInTheDocument();
    expect(screen.queryByText("Lead team")).toBeNull();
    expect(screen.queryByText("Docs")).toBeNull();
  });

  it("persists Project disclosure per organization", () => {
    const first = render(<NavProjects />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Launch" }));
    expect(localStorage.getItem("kaneo:project-sidebar:org-1")).toContain(
      "project-1",
    );
    first.unmount();

    render(<NavProjects />);
    fireEvent.click(screen.getByRole("button", { name: "Resources" }));
    fireEvent.click(screen.getByRole("button", { name: "Boards" }));
    expect(screen.getByText("Delivery")).toBeInTheDocument();
  });

  it("hydrates saved disclosure after the organization query resolves", () => {
    localStorage.setItem(
      "kaneo:project-sidebar:org-1",
      JSON.stringify(["project-1"]),
    );
    activeOrganization = undefined;
    const view = render(<NavProjects />);
    expect(screen.queryByText("Delivery")).toBeNull();

    activeOrganization = { id: "org-1", slug: "acme", name: "Acme" };
    view.rerender(<NavProjects />);
    fireEvent.click(screen.getByRole("button", { name: "Resources" }));
    fireEvent.click(screen.getByRole("button", { name: "Boards" }));
    expect(screen.getByText("Delivery")).toBeInTheDocument();
  });

  it("auto-expands the active Project route and opens the canonical board route", () => {
    pathname = "/dashboard/organization/acme/projects/launch";
    render(<NavProjects />);
    fireEvent.click(screen.getByRole("button", { name: "Resources" }));
    fireEvent.click(screen.getByRole("button", { name: "Boards" }));
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delivery" }));
    expect(navigate).toHaveBeenCalledWith({
      to: "/dashboard/organization/$organizationSlug/board/$boardSlug",
      params: { organizationSlug: "acme", boardSlug: "delivery" },
    });
  });

  it("does not expand every Project when one disclosure is clicked", () => {
    render(<NavProjects />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Launch" }));

    expect(
      screen.getByRole("button", { name: "Expand Later" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles disclosure state and keeps tree rows structurally valid", () => {
    const { container } = render(<NavProjects />);
    const disclosure = screen.getByRole("button", { name: "Expand Launch" });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(disclosure);
    expect(
      screen.getByRole("button", { name: "Collapse Launch" }),
    ).toHaveAttribute("aria-expanded", "true");
    for (const list of container.querySelectorAll("ul")) {
      expect([...list.children].every((child) => child.tagName === "LI")).toBe(
        true,
      );
    }
    expect(container.querySelector("li > li")).toBeNull();
  });
});
