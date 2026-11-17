import { expect, it } from "vitest";
import { hasRawId, hostLabel, resourceLinkLabel } from "./resource-label";

const internal = (path: string) => `${window.location.origin}${path}`;

it("detects cuid and UUID shapes", () => {
  expect(hasRawId("fskd8b8dl0gpntdx74m27rjh")).toBe(true);
  expect(hasRawId("7e5f8ac2-1b3d-4c9e-a5f0-9d2e7b4c1a68")).toBe(true);
  expect(hasRawId("PB-1042 Filter test A")).toBe(false);
  expect(hasRawId("2026-11-10")).toBe(false);
});

it("prefers a human title", () => {
  expect(
    resourceLinkLabel(internal("/dashboard/organization/x/table/t1"), "test"),
  ).toBe("test");
});

it("never shows an id-shaped title or path", () => {
  expect(
    resourceLinkLabel(internal("/dashboard/organization/x/table/t1"), null),
  ).toBe("Kaneo link");
  expect(
    resourceLinkLabel(
      internal("/dashboard/organization/x/table/t1"),
      "fskd8b8dl0gpntdx74m27rjh",
    ),
  ).toBe("Kaneo link");
});

it("falls back to the host for external links", () => {
  expect(resourceLinkLabel("https://figma.com/file/abc123", null)).toBe(
    "figma.com",
  );
  expect(hostLabel("not a url")).toBe("Kaneo link");
});
