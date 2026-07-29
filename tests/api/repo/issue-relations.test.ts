import { describe, expect, it, vi } from "vitest";
import { getGitHubIssueRelations } from "../../../apps/api/src/repo/controllers/get-repo-issue";

describe("GitHub issue relations", () => {
  it("returns parent and sub-issues", async () => {
    const parent = { number: 10, title: "Parent", state: "open" };
    const children = [{ number: 12, title: "Child", state: "closed" }];
    const octokit = { request: vi.fn().mockResolvedValue({ data: parent }), paginate: vi.fn().mockResolvedValue(children) };
    await expect(getGitHubIssueRelations(octokit, {})).resolves.toEqual({ parent, parentSupported: true, subIssues: children, subIssuesSupported: true });
  });

  it("handles unsupported endpoints but propagates operational errors", async () => {
    const unsupported = Object.assign(new Error("unsupported"), { status: 404 });
    const octokit = { request: vi.fn().mockRejectedValue(unsupported), paginate: vi.fn().mockRejectedValue(unsupported) };
    await expect(getGitHubIssueRelations(octokit, {})).resolves.toEqual({ parent: null, parentSupported: false, subIssues: [], subIssuesSupported: false });
    octokit.request.mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }));
    await expect(getGitHubIssueRelations(octokit, {})).rejects.toThrow("rate limited");
  });
});