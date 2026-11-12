import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("merges tailwind classes and resolves conflicts", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("keeps the text-ui size token next to a text colour", () => {
    expect(cn("text-ui text-foreground")).toBe("text-ui text-foreground");
  });

  it("still lets a later size override text-ui", () => {
    expect(cn("text-ui", "text-xs")).toBe("text-xs");
  });
});
