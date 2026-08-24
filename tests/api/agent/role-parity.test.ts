import { describe, expect, it } from "vitest";
import { isAgentApiKey } from "../../../apps/api/src/utils/require-organization-permission";

describe("agent API-key role parity", () => {
  it("identifies agent keys so their legacy scope map does not override their organization role", () => {
    expect(
      isAgentApiKey({
        metadata: { type: "agent" },
        permissions: { board: ["read"] },
      }),
    ).toBe(true);
  });

  it("keeps ordinary API keys scope-limited", () => {
    expect(
      isAgentApiKey({
        metadata: { type: "integration" },
        permissions: { board: ["read"] },
      }),
    ).toBe(false);
    expect(isAgentApiKey(undefined)).toBe(false);
  });
});
