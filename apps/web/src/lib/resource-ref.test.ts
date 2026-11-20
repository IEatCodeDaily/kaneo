import { describe, expect, it } from "vitest";
import { looksLikeCuid, matchResourceRef } from "./resource-ref";

const CUID = "y34w06ysli9a1lqk7jxths20";

type Item = { id: string; slug?: string | null; org: string };

const LIST: Item[] = [
  { id: CUID, slug: "api-2", org: "acme" },
  { id: "c0000000000000000000000", slug: "web", org: "acme" },
];

describe("looksLikeCuid", () => {
  it("accepts the createId() output shape (20-25 lowercase alphanumerics)", () => {
    expect(looksLikeCuid(CUID)).toBe(true);
    expect(looksLikeCuid("c1234567890123456789")).toBe(true); // 20
    expect(looksLikeCuid("c12345678901234567890123")).toBe(true); // 25
  });

  it("rejects slug-shaped and non-shape params", () => {
    expect(looksLikeCuid("api-2")).toBe(false); // hyphen
    expect(looksLikeCuid("web")).toBe(false); // too short
    expect(looksLikeCuid("UPPERCASEISNOTACUID123")).toBe(false);
    expect(looksLikeCuid(undefined)).toBe(false);
    expect(looksLikeCuid("c12345678901234567890123456")).toBe(false); // 26
  });
});

describe("matchResourceRef", () => {
  it("resolves a cuid-shaped ref by id first (legacy URLs)", () => {
    expect(
      matchResourceRef(
        LIST,
        CUID,
        (i) => i.id,
        (i) => i.slug,
      ),
    ).toEqual(LIST[0]);
    // The other fixture's id is also cuid-shaped: id match wins over any slug.
    expect(
      matchResourceRef(
        LIST,
        "c0000000000000000000000",
        (i) => i.id,
        (i) => i.slug,
      ),
    ).toEqual(LIST[1]);
  });

  it("resolves a slug-shaped ref by slug, case-insensitively", () => {
    expect(
      matchResourceRef(
        LIST,
        "API-2",
        (i) => i.id,
        (i) => i.slug,
      ),
    ).toEqual(LIST[0]);
  });

  it("falls back to the slug when a cuid-shaped ref matches no id", () => {
    const list: Item[] = [
      {
        id: "d0000000000000000000000",
        slug: "c1234567890123456789",
        org: "acme",
      },
    ];
    // 20 lowercase alphanumerics = cuid-shaped, but it is this row's slug.
    expect(
      matchResourceRef(
        list,
        "c1234567890123456789",
        (i) => i.id,
        (i) => i.slug,
      ),
    ).toEqual(list[0]);
  });

  it("fails closed: nothing matches, an empty list, or an absent ref", () => {
    expect(
      matchResourceRef(
        LIST,
        "nope",
        (i) => i.id,
        (i) => i.slug,
      ),
    ).toBeNull();
    // Foreign org's id is not in this org's list.
    expect(
      matchResourceRef(
        LIST,
        "zzzzzzzzzzzzzzzzzzzzzzzz",
        (i) => i.id,
        (i) => i.slug,
      ),
    ).toBeNull();
    expect(
      matchResourceRef(
        undefined,
        CUID,
        (i: Item) => i.id,
        (i: Item) => i.slug,
      ),
    ).toBeNull();
    expect(
      matchResourceRef(
        LIST,
        undefined,
        (i) => i.id,
        (i) => i.slug,
      ),
    ).toBeNull();
  });
});
