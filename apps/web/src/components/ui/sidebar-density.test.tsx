import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarMenuButton, SidebarProvider } from "@/components/ui/sidebar";

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(cleanup);

describe("sidebar menu density", () => {
  it("uses compact desktop rows while retaining mobile touch targets", () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton>Boards</SidebarMenuButton>
      </SidebarProvider>,
    );

    const button = screen.getByRole("button", { name: "Boards" });
    expect(button).toHaveClass("h-11", "md:h-7", "text-sm", "md:!text-xs");
    expect(button).toHaveClass(
      "focus-visible:ring-2",
      "group-data-[collapsible=icon]:size-8!",
    );
  });

  it("preserves the large profile-row variant", () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton size="lg">Profile</SidebarMenuButton>
      </SidebarProvider>,
    );

    expect(screen.getByRole("button", { name: "Profile" })).toHaveClass(
      "h-12",
      "text-sm",
    );
  });
});
