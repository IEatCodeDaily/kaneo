import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsSectionNav from "./settings-section-nav";

/**
 * KFL-188: the settings shell moves from a horizontal tab strip to a
 * dashboard-style left sidebar.
 *
 * What matters most here is NOT the visual change — it is that the existing
 * navigation semantics survive it. The old tab strip carried real conditional
 * logic that a restyle can silently drop:
 *
 *   - Repos is hidden entirely unless organization.reposEnabled is true.
 *   - Boards / Repos are disabled when the org has none of them.
 *   - Each section lands on a specific default page, not a bare section route.
 *
 * These tests pin that behaviour to the new component so the revamp cannot
 * quietly remove a section or make an empty one navigable.
 */

afterEach(cleanup);

const onNavigate = vi.fn();

afterEach(() => onNavigate.mockReset());

const BASE = {
  activeSection: "account" as const,
  hasBoards: true,
  hasRepos: true,
  reposEnabled: true,
  onNavigate,
};

describe("SettingsSectionNav (KFL-188)", () => {
  it("lists Account, Organization, Boards and Repos as sections", () => {
    render(<SettingsSectionNav {...BASE} />);

    for (const testid of [
      "settings-section-account",
      "settings-section-organization",
      "settings-section-boards",
      "settings-section-repos",
    ]) {
      expect(screen.getByTestId(testid)).toBeTruthy();
    }
  });

  it("hides Repos entirely when the organization has repos disabled", () => {
    render(<SettingsSectionNav {...BASE} reposEnabled={false} />);

    expect(screen.queryByTestId("settings-section-repos")).toBeNull();
    // The other three must survive.
    expect(screen.getByTestId("settings-section-account")).toBeTruthy();
  });

  it("disables Boards when the organization has none", () => {
    render(<SettingsSectionNav {...BASE} hasBoards={false} />);

    expect(screen.getByTestId("settings-section-boards")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("disables Repos when the organization has none", () => {
    render(<SettingsSectionNav {...BASE} hasRepos={false} />);

    expect(screen.getByTestId("settings-section-repos")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("marks the current section active", () => {
    render(<SettingsSectionNav {...BASE} activeSection="organization" />);

    expect(screen.getByTestId("settings-section-organization")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByTestId("settings-section-account")).not.toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("navigates each section to its default landing page", () => {
    render(<SettingsSectionNav {...BASE} />);

    screen.getByTestId("settings-section-account").click();
    expect(onNavigate).toHaveBeenCalledWith(
      "/dashboard/settings/account/information",
    );

    screen.getByTestId("settings-section-organization").click();
    expect(onNavigate).toHaveBeenCalledWith(
      "/dashboard/settings/organization/general",
    );
  });

  it("does not navigate from a disabled section", () => {
    render(<SettingsSectionNav {...BASE} hasBoards={false} />);

    screen.getByTestId("settings-section-boards").click();
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
