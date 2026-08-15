import { describe, expect, it } from "vitest";
import {
  buildPrincipalPickerOptions,
  resolvePrincipalSelection,
} from "@/lib/principal-picker-options";

const PRINCIPALS = [
  {
    id: "u1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    image: null,
    kind: "user" as const,
  },
  {
    id: "a1",
    name: "Codex",
    email: "codex@example.com",
    image: "https://img/a1.png",
    kind: "agent" as const,
  },
];

const TEAMS = [{ id: "t1", name: "Platform" }];

describe("buildPrincipalPickerOptions (KFL-160)", () => {
  it("maps agent principals to type agent and humans to type user", () => {
    const options = buildPrincipalPickerOptions(PRINCIPALS, TEAMS);

    expect(options).toEqual([
      {
        type: "user",
        value: "u1",
        label: "Ada Lovelace",
        image: undefined,
      },
      {
        type: "agent",
        value: "a1",
        label: "Codex",
        image: "https://img/a1.png",
      },
      { type: "team", value: "t1", label: "Platform" },
    ]);
  });

  it("tolerates missing principals and teams", () => {
    expect(buildPrincipalPickerOptions(undefined, undefined)).toEqual([]);
  });
});

describe("resolvePrincipalSelection (KFL-160)", () => {
  it("resolves an assigned agent to the agent group, not the user group", () => {
    expect(
      resolvePrincipalSelection({ userId: "a1", teamId: null }, PRINCIPALS),
    ).toEqual({ type: "agent", value: "a1" });
  });

  it("resolves an assigned human to the user group", () => {
    expect(
      resolvePrincipalSelection({ userId: "u1", teamId: null }, PRINCIPALS),
    ).toEqual({ type: "user", value: "u1" });
  });

  it("falls back to user when the principal list has not loaded", () => {
    expect(
      resolvePrincipalSelection({ userId: "a1", teamId: null }, undefined),
    ).toEqual({ type: "user", value: "a1" });
  });

  it("prefers a team assignment and returns null when unassigned", () => {
    expect(
      resolvePrincipalSelection({ userId: null, teamId: "t1" }, PRINCIPALS),
    ).toEqual({ type: "team", value: "t1" });
    expect(
      resolvePrincipalSelection({ userId: null, teamId: null }, PRINCIPALS),
    ).toBeNull();
  });
});
