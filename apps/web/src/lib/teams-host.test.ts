import { describe, expect, it } from "vitest";
import { inTeamsHost, tabTarget } from "./teams-host";

const win = (framed: boolean, native: boolean): Window => {
  const w: Record<string, unknown> = {};
  w.self = w;
  w.top = framed ? {} : w;
  if (native) w.nativeInterface = {};
  return w as unknown as Window;
};

describe("tabTarget", () => {
  it("honours dashboard paths from a card deep link", () => {
    expect(tabTarget("/dashboard/organization/o/board/b/task/t1")).toBe(
      "/dashboard/organization/o/board/b/task/t1",
    );
  });
  it("falls back to /dashboard for anything else", () => {
    for (const bad of [
      undefined,
      "",
      "https://evil.example",
      "//evil.example",
      "/dashboard/../admin",
      "/dashboard?x=1",
      "/auth/sign-in",
      "javascript:alert(1)",
    ])
      expect(tabTarget(bad)).toBe("/dashboard");
  });
});

describe("inTeamsHost", () => {
  it("detects framed Teams (desktop/web) and Teams mobile WebView", () => {
    expect(inTeamsHost(win(true, false))).toBe(true);
    expect(inTeamsHost(win(false, true))).toBe(true);
  });
  it("is false for a plain browser tab", () => {
    expect(inTeamsHost(win(false, false))).toBe(false);
  });
});
