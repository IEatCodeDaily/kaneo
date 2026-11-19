import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { AppearanceSettings } from "./appearance";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

describe("Appearance settings", () => {
  it("changes presets, validates accents and resets without losing the preset", () => {
    useUserPreferencesStore.setState({
      theme: "dark",
      themePreset: "mono",
      accentColor: null,
    });
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByTestId("preset-teal"));
    expect(useUserPreferencesStore.getState().themePreset).toBe("teal");
    const hex = screen.getByLabelText("settings:appearance.hex");
    fireEvent.change(hex, { target: { value: "#ABCDEF" } });
    expect(useUserPreferencesStore.getState().accentColor).toBe("#abcdef");
    fireEvent.change(hex, { target: { value: "#badhex" } });
    expect(hex.getAttribute("aria-invalid")).toBe("true");
    expect(useUserPreferencesStore.getState().accentColor).toBe("#abcdef");
    fireEvent.click(
      screen.getByRole("button", { name: "settings:appearance.reset" }),
    );
    expect(useUserPreferencesStore.getState().accentColor).toBeNull();
    expect(useUserPreferencesStore.getState().themePreset).toBe("teal");
    expect((hex as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "#2563eb" }));
    expect(useUserPreferencesStore.getState().accentColor).toBe("#2563eb");
    fireEvent.click(screen.getByTestId("preset-mono"));
    expect(useUserPreferencesStore.getState().accentColor).toBeNull();
  });

  it("edits tokens per mode and clears them on preset change", () => {
    useUserPreferencesStore.setState({
      theme: "dark",
      themePreset: "mono",
      accentColor: null,
      themeOverrides: {},
    });
    render(<AppearanceSettings />);
    fireEvent.change(
      screen.getByLabelText("settings:appearance.tokenBackground"),
      { target: { value: "#123456" } },
    );
    expect(
      useUserPreferencesStore.getState().themeOverrides.background,
    ).toEqual({ dark: "#123456" });
    fireEvent.click(screen.getByTestId("customize-tab-light"));
    fireEvent.change(
      screen.getByLabelText("settings:appearance.tokenBackground"),
      { target: { value: "#ABCDEF" } },
    );
    expect(
      useUserPreferencesStore.getState().themeOverrides.background,
    ).toEqual({ dark: "#123456", light: "#abcdef" });
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:appearance.resetToken settings:appearance.tokenBackground",
      }),
    );
    expect(
      useUserPreferencesStore.getState().themeOverrides.background,
    ).toBeUndefined();
    fireEvent.change(
      screen.getByLabelText("settings:appearance.tokenBackground"),
      { target: { value: "#123456" } },
    );
    expect(
      useUserPreferencesStore.getState().themeOverrides.background,
    ).toBeDefined();
    fireEvent.click(screen.getByTestId("preset-teal"));
    expect(useUserPreferencesStore.getState().themeOverrides).toEqual({});
  });
});
