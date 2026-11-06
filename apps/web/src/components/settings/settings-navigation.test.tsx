import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? key,
  }),
}));

import SettingsSectionNav from "./settings-section-nav";

const viewport = vi.hoisted(() => ({ mobile: true }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => viewport.mobile }));
afterEach(() => {
  cleanup();
  viewport.mobile = true;
});
it("restores navigation when a closed mobile menu becomes desktop", () => {
  const props = {
    activeSection: "organization" as const,
    hasBoards: true,
    hasRepos: true,
    reposEnabled: true,
    onNavigate: () => undefined,
  };
  const { rerender } = render(<SettingsSectionNav {...props} />);
  const disclosure = document.querySelector("details");
  if (!disclosure) throw new Error("Settings disclosure missing");
  disclosure.open = false;
  fireEvent(disclosure, new Event("toggle"));
  viewport.mobile = false;
  rerender(<SettingsSectionNav {...props} />);
  expect(disclosure.open).toBe(true);
});
it("marks only the current page and keeps a mobile navigation disclosure", () => {
  render(
    <SettingsSectionNav
      activeSection="organization"
      pathname="/dashboard/settings/organization/members"
      hasBoards
      hasRepos
      reposEnabled
      onNavigate={() => undefined}
    />,
  );
  const current = document.querySelectorAll('[aria-current="page"]');
  expect(current).toHaveLength(1);
  expect(current[0]).toHaveAttribute(
    "data-settings-path",
    "/dashboard/settings/organization/members",
  );
  expect(document.querySelector("summary")).toHaveTextContent(
    "navigation:page.settingsTitle",
  );
});
it("exposes member, team and account pages directly in one sectioned navigation", () => {
  render(
    <SettingsSectionNav
      activeSection="organization"
      hasBoards
      hasRepos
      reposEnabled
      onNavigate={() => undefined}
    />,
  );
  for (const path of [
    "account/information",
    "account/authentication",
    "account/developer",
    "organization/members",
    "organization/teams",
    "organization/roles",
  ]) {
    expect(
      document.querySelector(
        `[data-settings-path="/dashboard/settings/${path}"]`,
      ),
    ).toBeTruthy();
  }
  expect(screen.getByTestId("settings-section-repos")).toBeTruthy();
  expect(screen.getByText("Resources")).toBeInTheDocument();
});
