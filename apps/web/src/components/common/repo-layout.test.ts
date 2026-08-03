import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("keeps the shared repository header above every subview while scrolling", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/common/repo-layout.tsx"),
    "utf8",
  );
  const header = source.slice(
    source.indexOf("<Layout.Header"),
    source.indexOf("</Layout.Header>"),
  );

  expect(header).toContain("sticky");
  expect(header).toContain("top-0");
  expect(header).toContain("z-10");
});
