import { describe, expect, it } from "vitest";
import { archiveBadgeParts, formatArchivedSubtext } from "./archive-display";

describe("archiveBadgeParts", () => {
  it("returns archive icon parts when archivedAt is set, whatever the status", () => {
    // Archival is orthogonal to status (#226): the icon must depend ONLY on
    // archivedAt so an archived in-progress ticket still shows its status
    // color with the archive glyph layered on top.
    const parts = archiveBadgeParts({
      archivedAt: "2026-08-14T10:00:00.000Z",
      status: "in-progress",
      isFinal: false,
      icon: null,
    });
    expect(parts.showArchive).toBe(true);
    // base icon remains the status icon
    expect(parts.baseIconType).toBe("status");
  });

  it("returns plain status parts when not archived", () => {
    const parts = archiveBadgeParts({
      archivedAt: null,
      status: "done",
      isFinal: true,
      icon: null,
    });
    expect(parts.showArchive).toBe(false);
    expect(parts.baseIconType).toBe("status");
  });
});

describe("formatArchivedSubtext", () => {
  it("formats the archived-at line with the archiver name", () => {
    expect(
      formatArchivedSubtext("2026-08-14T10:00:00.000Z", "Raisal Wardana"),
    ).toMatch(/Archived/);
    expect(
      formatArchivedSubtext("2026-08-14T10:00:00.000Z", "Raisal Wardana"),
    ).toContain("Raisal Wardana");
  });

  it("falls back to date-only when the archiver is unknown", () => {
    const text = formatArchivedSubtext("2026-08-14T10:00:00.000Z", null);
    expect(text).toMatch(/Archived/);
    expect(text).not.toContain("by undefined");
    expect(text).not.toContain("null");
  });

  it("returns empty for unarchived tickets", () => {
    expect(formatArchivedSubtext(null, null)).toBe("");
  });
});
