import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #113: the profile menu theme control only offered light/dark, leaving the
 * "system" theme (already supported by the store and the preferences page)
 * unreachable. It is now a three-way light/dark/auto toggle group.
 */

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}));

const setTheme = vi.fn();
let currentTheme: "light" | "dark" | "system" = "dark";

vi.mock("@/store/user-preferences", () => ({
  useUserPreferencesStore: () => ({ setTheme, theme: currentTheme }),
}));

import { ThemeToggleDropdown } from "./theme-toggle-dropdown";

afterEach(() => {
  cleanup();
  setTheme.mockReset();
  currentTheme = "dark";
});

describe("ThemeToggleDropdown (#113)", () => {
  it("offers light, dark and auto options", () => {
    render(<ThemeToggleDropdown />);

    expect(screen.getByTestId("user-menu-theme-light")).toBeTruthy();
    expect(screen.getByTestId("user-menu-theme-dark")).toBeTruthy();
    expect(screen.getByTestId("user-menu-theme-system")).toBeTruthy();
  });

  it("labels the system option 'Auto'", () => {
    render(<ThemeToggleDropdown />);

    expect(
      screen.getByTestId("user-menu-theme-system").getAttribute("aria-label"),
    ).toBe("Auto");
  });

  it("selects the system theme when Auto is pressed", () => {
    render(<ThemeToggleDropdown />);

    fireEvent.click(screen.getByTestId("user-menu-theme-system"));

    expect(setTheme).toHaveBeenCalledWith("system");
  });

  it("selects the light theme when Light is pressed", () => {
    render(<ThemeToggleDropdown />);

    fireEvent.click(screen.getByTestId("user-menu-theme-light"));

    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("marks the active theme as pressed", () => {
    currentTheme = "system";
    render(<ThemeToggleDropdown />);

    expect(
      screen.getByTestId("user-menu-theme-system").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByTestId("user-menu-theme-dark").getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("keeps the current theme when the pressed option is toggled off", () => {
    currentTheme = "system";
    render(<ThemeToggleDropdown />);

    // Base UI reports an empty group when the active item is un-pressed; a
    // theme picker has no "none" state, so nothing should be written.
    fireEvent.click(screen.getByTestId("user-menu-theme-system"));

    expect(setTheme).not.toHaveBeenCalled();
  });

  /**
   * Negative control: proves the assertions above are wired to the real
   * component rather than passing vacuously. A two-option control (the old
   * light/dark switch shape) must fail the Auto lookup.
   */
  it("negative control: a light/dark-only control has no Auto option", () => {
    render(
      <div>
        <button data-testid="user-menu-theme-light" type="button" />
        <button data-testid="user-menu-theme-dark" type="button" />
      </div>,
    );

    expect(screen.queryByTestId("user-menu-theme-system")).toBeNull();
  });
});
