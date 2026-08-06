import { describe, expect, it } from "vitest";
import { checkOrganizationName } from "../../../apps/api/src/utils/check-organization-name";

describe("checkOrganizationName", () => {
  it("accepts normal organization names", () => {
    expect(checkOrganizationName("Acme Inc.").ok).toBe(true);
    expect(checkOrganizationName("My Team — Project").ok).toBe(true);
    expect(checkOrganizationName("Crypto Snack").ok).toBe(true);
  });

  it("rejects names with embedded URLs (2026-05-28 phishing pattern)", () => {
    const result = checkOrganizationName(
      "BANK OPER https://ij5205.craftum.io/page2",
    );
    expect(result.ok).toBe(false);
  });

  it("rejects bare www. URLs", () => {
    expect(checkOrganizationName("visit www.evil.example").ok).toBe(false);
  });

  it("rejects names longer than 100 characters", () => {
    const result = checkOrganizationName("a".repeat(101));
    expect(result.ok).toBe(false);
  });

  it("rejects names with HTML / template chars", () => {
    expect(checkOrganizationName("<!DOCTYPE html><script>").ok).toBe(false);
    expect(checkOrganizationName("hello {{name}}").ok).toBe(false);
  });

  it("rejects empty / whitespace-only names", () => {
    expect(checkOrganizationName("").ok).toBe(false);
    expect(checkOrganizationName("   ").ok).toBe(false);
  });

  it("returns the rejection reason as a string", () => {
    const r = checkOrganizationName("a".repeat(150));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(typeof r.reason).toBe("string");
  });
});
