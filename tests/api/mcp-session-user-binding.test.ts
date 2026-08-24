import { describe, expect, it } from "vitest";
import { isMcpSessionOwner } from "../../apps/api/src/mcp";

describe("MCP streamable session ownership", () => {
  it("allows the creating principal to reuse its session", () => {
    expect(isMcpSessionOwner({ userId: "user-a" }, "user-a")).toBe(true);
  });

  it("hides another principal's session as unavailable", () => {
    expect(isMcpSessionOwner({ userId: "user-a" }, "user-b")).toBe(false);
    expect(isMcpSessionOwner(undefined, "user-b")).toBe(false);
  });
});
