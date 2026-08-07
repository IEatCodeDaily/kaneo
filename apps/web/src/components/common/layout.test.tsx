import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Layout from "@/components/common/layout";
import { useSidebar } from "@/components/ui/sidebar";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/components/common/mobile-user-fab", () => ({
  MobileUserFab: () => null,
}));
vi.mock("@/components/demo-alert", () => ({ DemoAlert: () => null }));
vi.mock("@/store/user-preferences", () => ({
  useUserPreferencesStore: () => ({
    setSidebarDefaultOpen: vi.fn(),
    sidebarDefaultOpen: false,
  }),
}));
vi.mock("@/components/app-sidebar", () => ({
  AppSidebar: () => {
    const { openMobile } = useSidebar();
    return (
      <output data-testid="mobile-sidebar-state">{String(openMobile)}</output>
    );
  },
}));

afterEach(cleanup);

describe("Layout.Header", () => {
  it("mounts a mobile sidebar trigger that opens the sidebar", () => {
    render(
      <Layout>
        <Layout.Header>Repository</Layout.Header>
      </Layout>,
    );

    fireEvent.click(screen.getByTestId("mobile-sidebar-toggle"));

    expect(screen.getByTestId("mobile-sidebar-state")).toHaveTextContent(
      "true",
    );
  });
});
