import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActingOctokit: vi.fn(),
}));

vi.mock("../../../apps/api/src/repo/controllers/manage-github-repo", () => ({
  getActingOctokit: mocks.getActingOctokit,
}));

const { createGitHubPullRequestReview, listGitHubPullRequestReviews } =
  await import(
    "../../../apps/api/src/repo/controllers/github-pull-request-reviews"
  );

function octokitStub({
  reviews = [],
  comments = [],
  createReview = vi.fn().mockResolvedValue({
    data: { id: 1, state: "APPROVED", html_url: "https://example.test/r/1" },
  }),
}: {
  reviews?: unknown[];
  comments?: unknown[];
  createReview?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    rest: {
      pulls: {
        listReviews: vi.fn().mockResolvedValue({ data: reviews }),
        listReviewComments: vi.fn().mockResolvedValue({ data: comments }),
        createReview,
      },
    },
  };
}

describe("listGitHubPullRequestReviews", () => {
  it("omits unsubmitted PENDING drafts and maps inline threads", async () => {
    mocks.getActingOctokit.mockResolvedValue({
      repo: { owner: "acme", name: "app" },
      octokit: octokitStub({
        reviews: [
          {
            id: 1,
            state: "APPROVED",
            body: "ship it",
            submitted_at: "2026-07-30T10:00:00Z",
            user: { login: "alice", avatar_url: "a.png" },
            html_url: "https://example.test/r/1",
          },
          { id: 2, state: "PENDING", body: "draft", user: { login: "bob" } },
        ],
        comments: [
          {
            id: 10,
            body: "nit",
            path: "src/a.ts",
            line: 4,
            side: "RIGHT",
            created_at: "2026-07-30T10:05:00Z",
            user: { login: "alice", avatar_url: "a.png" },
            html_url: "https://example.test/c/10",
            in_reply_to_id: null,
          },
        ],
      }),
      actedAsUser: true,
    });

    const result = await listGitHubPullRequestReviews({
      repoId: "repo-1",
      number: 7,
      userId: "user-1",
    });

    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0]).toMatchObject({
      state: "APPROVED",
      authorLogin: "alice",
    });
    expect(result.comments[0]).toMatchObject({
      path: "src/a.ts",
      line: 4,
      inReplyToId: null,
    });
  });
});

describe("createGitHubPullRequestReview", () => {
  it("refuses to submit without a delegated GitHub identity", async () => {
    mocks.getActingOctokit.mockResolvedValue({
      repo: { owner: "acme", name: "app" },
      octokit: octokitStub(),
      actedAsUser: false,
    });

    // An App-authored approval would satisfy branch protection on behalf of a
    // human who never approved, so this must fail rather than fall back.
    await expect(
      createGitHubPullRequestReview({
        repoId: "repo-1",
        number: 7,
        event: "APPROVE",
        userId: "user-1",
      }),
    ).rejects.toThrow(/Connect your GitHub account/);
  });

  it("requires a comment when requesting changes", async () => {
    mocks.getActingOctokit.mockResolvedValue({
      repo: { owner: "acme", name: "app" },
      octokit: octokitStub(),
      actedAsUser: true,
    });

    await expect(
      createGitHubPullRequestReview({
        repoId: "repo-1",
        number: 7,
        event: "REQUEST_CHANGES",
        body: "   ",
        userId: "user-1",
      }),
    ).rejects.toThrow(/comment is required/);
  });

  it("approves without a body and attributes a commented review", async () => {
    const createReview = vi.fn().mockResolvedValue({
      data: { id: 5, state: "APPROVED", html_url: "https://example.test/r/5" },
    });
    mocks.getActingOctokit.mockResolvedValue({
      repo: { owner: "acme", name: "app" },
      octokit: octokitStub({ createReview }),
      actedAsUser: true,
    });

    await createGitHubPullRequestReview({
      repoId: "repo-1",
      number: 7,
      event: "APPROVE",
      userId: "user-1",
    });
    expect(createReview).toHaveBeenCalledWith(
      expect.objectContaining({ event: "APPROVE", pull_number: 7 }),
    );
    expect(createReview.mock.calls[0][0]).not.toHaveProperty("body");

    await createGitHubPullRequestReview({
      repoId: "repo-1",
      number: 7,
      event: "COMMENT",
      body: "looks good",
      userId: "user-1",
    });
    expect(createReview.mock.calls[1][0].body).toContain("looks good");
    expect(createReview.mock.calls[1][0].body).toContain("sent from kaneo");
  });
});
