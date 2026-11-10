import type { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
  type CoercibleField,
  coerceValue,
  FIELD_TYPES,
  fieldOptionsSchema,
  isIndexedField,
  pgTypeFor,
} from "../../../apps/api/src/data-table/fields";

function expectBadRequest(run: () => unknown, message?: string) {
  try {
    run();
    expect.unreachable("expected coerceValue to throw");
  } catch (error) {
    // Status carries the contract — plain Errors surface as 500s in Hono.
    // instanceof is unreliable here: the gate resolves a second hono copy for
    // tests/, so cross-package class identity fails even on real 400s.
    expect(error).toBeInstanceOf(Error);
    expect((error as HTTPException).status).toBe(400);
    if (message) expect((error as HTTPException).message).toBe(message);
  }
}

describe("field registry", () => {
  it("maps field types to physical column types", () => {
    expect(pgTypeFor("text")).toBe("text");
    expect(pgTypeFor("longtext")).toBe("text");
    expect(pgTypeFor("number")).toBe("numeric");
    expect(pgTypeFor("currency")).toBe("numeric");
    expect(pgTypeFor("date")).toBe("date");
    expect(pgTypeFor("datetime")).toBe("timestamptz");
    expect(pgTypeFor("checkbox")).toBe("boolean");
    expect(pgTypeFor("multiselect")).toBe("jsonb");
    expect(pgTypeFor("link")).toBe("jsonb");
  });

  it("indexes select/user/date/datetime columns only", () => {
    for (const type of ["select", "user", "date", "datetime"] as const) {
      expect(isIndexedField(type)).toBe(true);
    }
    expect(isIndexedField("text")).toBe(false);
    expect(isIndexedField("number")).toBe(false);
  });

  it("accepts an optional required flag for every type", () => {
    const text = fieldOptionsSchema("text");
    expect(text).toBeDefined();
    expect(v.safeParse(text, {}).success).toBe(true);
    expect(v.safeParse(text, { required: true }).success).toBe(true);
    expect(v.safeParse(text, { required: "yes" }).success).toBe(false);
    expect(v.safeParse(text, { other: 1 }).success).toBe(false);
    const select = fieldOptionsSchema("select");
    expect(select).toBeDefined();
    // optioned types still require their payload: choices for select
    expect(v.safeParse(select, { required: true }).success).toBe(false);
    expect(
      v.safeParse(select, {
        choices: [{ id: "a", label: "Alpha" }],
        required: true,
      }).success,
    ).toBe(true);
    expect(FIELD_TYPES).toHaveLength(15);
  });
});

describe("coerceValue", () => {
  it("passes through null as a cleared cell", () => {
    expect(coerceValue({ type: "number" }, null)).toBeNull();
    expect(coerceValue({ type: "text" }, undefined)).toBeNull();
  });

  it("requires finite numbers for numeric types", () => {
    expect(coerceValue({ type: "number" }, 12.5)).toBe(12.5);
    expect(coerceValue({ type: "currency" }, -3)).toBe(-3);
    expectBadRequest(
      () => coerceValue({ type: "number" }, "12"),
      "Field type number requires a finite number",
    );
    expectBadRequest(() => coerceValue({ type: "percent" }, Number.NaN));
  });

  it("validates date and datetime shapes", () => {
    expect(coerceValue({ type: "date" }, "2026-02-01")).toBe("2026-02-01");
    expectBadRequest(() => coerceValue({ type: "date" }, "01/02/2026"));
    expectBadRequest(() => coerceValue({ type: "date" }, "2026-13-40"));
    expect(coerceValue({ type: "datetime" }, "2026-02-01T10:30:00.000Z")).toBe(
      "2026-02-01T10:30:00.000Z",
    );
    expectBadRequest(() => coerceValue({ type: "datetime" }, "not a date"));
  });

  it("requires booleans for checkbox", () => {
    expect(coerceValue({ type: "checkbox" }, true)).toBe(true);
    expectBadRequest(() => coerceValue({ type: "checkbox" }, "true"));
  });

  it("validates select values against field choices", () => {
    const field: CoercibleField = {
      type: "select",
      options: { choices: [{ id: "a", label: "Alpha" }] },
    };
    expect(coerceValue(field, "a")).toBe("a");
    expectBadRequest(() => coerceValue(field, "b"));
  });

  it("validates multiselect arrays against field choices", () => {
    const field: CoercibleField = {
      type: "multiselect",
      options: {
        choices: [
          { id: "a", label: "Alpha" },
          { id: "b", label: "Beta" },
        ],
      },
    };
    expect(coerceValue(field, ["a", "b"])).toEqual(["a", "b"]);
    expectBadRequest(() => coerceValue(field, ["a", "zzz"]));
    expectBadRequest(() => coerceValue(field, "a"));
  });

  it("requires strings for text-family types", () => {
    expect(coerceValue({ type: "text" }, "ok")).toBe("ok");
    expect(coerceValue({ type: "user" }, "user_1")).toBe("user_1");
    expectBadRequest(() => coerceValue({ type: "text" }, 5));
  });

  it("accepts only http(s) URLs", () => {
    expect(coerceValue({ type: "url" }, "https://kaneo.app")).toBe(
      "https://kaneo.app",
    );
    expect(coerceValue({ type: "url" }, "http://localhost:1337")).toBe(
      "http://localhost:1337",
    );
    expectBadRequest(() => coerceValue({ type: "url" }, "javascript:alert(1)"));
    expectBadRequest(() => coerceValue({ type: "url" }, "not a url"));
  });

  it("checks basic email format", () => {
    expect(coerceValue({ type: "email" }, "a@b.co")).toBe("a@b.co");
    expectBadRequest(() => coerceValue({ type: "email" }, "nope"));
  });

  it("lets json through but rejects unparseable strings", () => {
    expect(coerceValue({ type: "json" }, { a: 1 })).toEqual({ a: 1 });
    expect(coerceValue({ type: "json" }, '{"a":1}')).toBe('{"a":1}');
    expectBadRequest(() => coerceValue({ type: "json" }, "{nope"));
  });

  it("requires string row-id arrays for link fields", () => {
    expect(coerceValue({ type: "link" }, ["row1", "row2"])).toEqual([
      "row1",
      "row2",
    ]);
    expectBadRequest(() => coerceValue({ type: "link" }, "row1"));
  });
});
