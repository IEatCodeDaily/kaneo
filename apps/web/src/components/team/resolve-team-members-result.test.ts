import { describe, expect, it } from "vitest";
import { resolveTeamMembersResult } from "./resolve-team-members-result";

describe("resolveTeamMembersResult (#121)", () => {
  it("normalizes Better Auth's empty-team 400 into an empty membership list", () => {
    expect(
      resolveTeamMembersResult({
        data: null,
        error: {
          code: "USER_IS_NOT_A_MEMBER_OF_THE_TEAM",
          message: "User is not a member of the team",
          status: 400,
          statusText: "Bad Request",
        },
      }),
    ).toEqual([]);
  });

  it("does not hide genuine team-member query failures", () => {
    expect(() =>
      resolveTeamMembersResult({
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Not allowed",
          status: 403,
          statusText: "Forbidden",
        },
      }),
    ).toThrow("Not allowed");
  });
});
