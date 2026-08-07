import { describe, expect, it } from "vitest";
import {
  isTemplateDateOffset,
  resolveTemplateDate,
} from "./task-template-date-offset";

describe("task template date offsets", () => {
  const now = new Date("2026-08-02T12:00:00.000Z");

  it("resolves signed minute, hour, day, and week offsets", () => {
    expect(resolveTemplateDate(null, "+7d", now)?.toISOString()).toBe(
      "2026-08-09T12:00:00.000Z",
    );
    expect(resolveTemplateDate(null, "-2h", now)?.toISOString()).toBe(
      "2026-08-02T10:00:00.000Z",
    );
  });

  it("rejects malformed offsets and preserves absolute dates", () => {
    expect(resolveTemplateDate(null, "7 days", now)).toBeUndefined();
    expect(
      resolveTemplateDate("2026-08-10T00:00:00.000Z", null, now)?.toISOString(),
    ).toBe("2026-08-10T00:00:00.000Z");
    expect(isTemplateDateOffset("+30m")).toBe(true);
    expect(isTemplateDateOffset("tomorrow")).toBe(false);
  });
});
