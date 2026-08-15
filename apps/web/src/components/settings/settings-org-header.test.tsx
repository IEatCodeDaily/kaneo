import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsOrgHeader from "./settings-org-header";

/**
 * The org avatar block at the top of a settings sub-sidebar.
 *
 * Boards settings had this; Repos settings did not, so the two panes looked
 * like different products. Extracting it means the next settings section that
 * grows a sub-sidebar cannot forget it, and a change to the avatar treatment
 * lands in both places at once.
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? key,
  }),
}));

afterEach(cleanup);

describe("SettingsOrgHeader", () => {
  it("shows the organization name and role", () => {
    render(
      <SettingsOrgHeader
        organizationLogo="https://example.test/logo.png"
        organizationName="NevrLabs"
        role="owner"
      />,
    );

    expect(screen.getByText("NevrLabs")).toBeTruthy();
    expect(screen.getByTestId("settings-org-role").textContent).toContain(
      "owner",
    );
  });

  it("falls back to initials when there is no logo", () => {
    render(<SettingsOrgHeader organizationName="NevrLabs" role="member" />);

    // getInitials("NevrLabs") -> "N" style fallback; assert SOMETHING rendered
    // rather than the exact glyph, so the shared initials helper stays free to
    // change without breaking this.
    expect(screen.getByTestId("settings-org-avatar-fallback")).toBeTruthy();
  });

  it("renders without an organization name without crashing", () => {
    render(<SettingsOrgHeader role="member" />);
    expect(screen.getByTestId("settings-org-header")).toBeTruthy();
  });
});
