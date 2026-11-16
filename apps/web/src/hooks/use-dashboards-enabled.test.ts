import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const organization = vi.hoisted(() => ({ current: {} as object | undefined }));
vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: organization.current }),
}));

import { useDashboardsEnabled } from "./use-dashboards-enabled";

describe("useDashboardsEnabled", () => {
  it.each([
    [{ tablesEnabled: true, dashboardsEnabled: true }, true],
    [{ tablesEnabled: true, dashboardsEnabled: false }, false],
    [{ tablesEnabled: false, dashboardsEnabled: true }, false],
    [undefined, false],
  ])("%o -> %s", (flags, expected) => {
    organization.current = flags;
    expect(renderHook(() => useDashboardsEnabled()).result.current).toBe(
      expected,
    );
  });
});
