import { describe, expect, it } from "vitest";
import { getGithubPermissions } from "./github-permissions";

describe("getGithubPermissions", () => {
  it("lists classic OAuth scopes when GitHub returns them", () => {
    expect(getGithubPermissions("repo, read:user user:email")).toEqual([
      { label: "repo" },
      { label: "read:user" },
      { label: "user:email" },
    ]);
  });

  it.each([null, undefined, "", "   "])(
    "describes GitHub App access when the detailed scope list is %s",
    (scope) => {
      expect(getGithubPermissions(scope)).toEqual([
        {
          label: "GitHub account identity",
          detail:
            "Used to attribute actions you initiate to your GitHub account.",
        },
        {
          label: "Installed repository access",
          detail:
            "Limited to repositories and permissions approved for the GitHub App installation.",
        },
      ]);
    },
  );
});
