import { useLayoutEffect } from "react";
import { applyAppearance } from "@/lib/appearance";
import { useUserPreferencesStore } from "@/store/user-preferences";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, themePreset, accentColor } = useUserPreferencesStore();

  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      applyAppearance({ theme, themePreset, accentColor }, media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, themePreset, accentColor]);

  return <>{children}</>;
}
