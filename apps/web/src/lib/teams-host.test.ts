import { describe, expect, it } from "vitest";
import { inTeamsHost } from "./teams-host";

const win = (framed: boolean, native: boolean): Window => {
  const w: Record<string, unknown> = {};
  w.self = w;
  w.top = framed ? {} : w;
  if (native) w.nativeInterface = {};
  return w as unknown as Window;
};

describe("inTeamsHost", () => {
  it("detects framed Teams (desktop/web) and Teams mobile WebView", () => {
    expect(inTeamsHost(win(true, false))).toBe(true);
    expect(inTeamsHost(win(false, true))).toBe(true);
  });
  it("is false for a plain browser tab", () => {
    expect(inTeamsHost(win(false, false))).toBe(false);
  });
});
