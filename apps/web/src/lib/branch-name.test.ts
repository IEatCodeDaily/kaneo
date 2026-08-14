import { describe, expect, it } from "vitest";
import { generateBranchName } from "./branch-name";

describe("generateBranchName", () => {
  it("uses the CAPITALIZED board prefix (KFL-337 not kfl-337)", () => {
    expect(generateBranchName("{slug}-{number}", "kfl", 337, "Fix it")).toBe(
      "KFL-337",
    );
  });

  it("keeps the title slugified lowercase", () => {
    expect(
      generateBranchName("{slug}-{number}/{title}", "kfl", 42, "Fix The Bug!"),
    ).toBe("KFL-42/fix-the-bug");
  });

  it("returns empty without slug or number", () => {
    expect(generateBranchName("{slug}-{number}", undefined, 1, "t")).toBe("");
    expect(generateBranchName("{slug}-{number}", "kfl", null, "t")).toBe("");
  });

  it("uppercases a prefix that is already mixed case exactly once", () => {
    expect(generateBranchName("{slug}-{number}", "Kfl", 5, "")).toBe("KFL-5");
  });
});
