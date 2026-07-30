import { describe, expect, it } from "vitest";
import { validatePermissions } from "../../../apps/api/src/agent";

describe("agent permission validation", () => {
  it("accepts an explicit least-privilege grant", () => {
    expect(
      validatePermissions({ board: ["read"], task: ["read", "create"] }),
    ).toEqual({ board: ["read"], task: ["read", "create"] });
  });

  it.each([
    undefined,
    {},
    { task: ["delete"] },
    { user: ["read"] },
    { task: [] },
  ])("rejects missing or elevated grants: %j", (permissions) => {
    expect(() => validatePermissions(permissions)).toThrow();
  });
});
