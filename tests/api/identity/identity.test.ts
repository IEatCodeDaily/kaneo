import { describe, expect, it } from "vitest";
import {
  normalizeBoardKey,
  normalizeOrganizationSlug,
  parseTicketKey,
} from "../../../apps/api/src/identity/identity";

describe("identity normalization", () => {
  it("canonicalizes organization slugs to lowercase", () => {
    expect(normalizeOrganizationSlug("Nevr-Labs42")).toBe("nevr-labs42");
  });

  it("canonicalizes board keys to uppercase", () => {
    expect(normalizeBoardKey("core-api")).toBe("CORE-API");
  });
});

describe("parseTicketKey", () => {
  it("splits on the final hyphen-number suffix", () => {
    expect(parseTicketKey("CORE-API-42")).toEqual({
      boardKey: "CORE-API",
      number: 42,
    });
  });

  it("canonicalizes lowercase input", () => {
    expect(parseTicketKey("core-api-42")).toEqual({
      boardKey: "CORE-API",
      number: 42,
    });
  });

  it.each(["CORE-0", "CORE--1", " CORE-1", "CORE-1 ", "CORE -1", "-42", "42"])(
    "rejects invalid ticket key %j",
    (ticketKey) => {
      expect(parseTicketKey(ticketKey)).toBeNull();
    },
  );
});
