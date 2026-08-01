import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useCommentDraftStore, {
  commentDraftKey,
  isPersistableCommentDraft,
} from "@/lib/editor-comment-draft";

const STORAGE_NAME = "comment-drafts";

function resetStore() {
  useCommentDraftStore.setState({ drafts: {} });
}

describe("commentDraftKey", () => {
  it("scopes the draft to a single task", () => {
    expect(commentDraftKey("task-1")).toBe("comment:task-1");
    expect(commentDraftKey("task-2")).not.toBe(commentDraftKey("task-1"));
  });

  it("falls back to a stable key when the task id is missing", () => {
    expect(commentDraftKey(undefined)).toBe("comment:no-task");
    expect(commentDraftKey(null)).toBe("comment:no-task");
    expect(commentDraftKey("")).toBe("comment:no-task");
  });
});

describe("isPersistableCommentDraft", () => {
  it("accepts real content", () => {
    expect(isPersistableCommentDraft("half typed")).toBe(true);
    expect(isPersistableCommentDraft("<p>half typed</p>")).toBe(true);
  });

  it("rejects empty and whitespace-only markup", () => {
    expect(isPersistableCommentDraft("")).toBe(false);
    expect(isPersistableCommentDraft("   \n  ")).toBe(false);
    expect(isPersistableCommentDraft("<p></p>")).toBe(false);
    expect(isPersistableCommentDraft("<p><br></p>")).toBe(false);
  });
});

describe("useCommentDraftStore", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  afterEach(() => {
    localStorage.clear();
    resetStore();
    vi.useRealTimers();
  });

  it("saves and reads back a draft for a task", () => {
    const key = commentDraftKey("task-1");
    useCommentDraftStore.getState().saveDraft(key, "half typed comment");

    expect(useCommentDraftStore.getState().getDraft(key)?.content).toBe(
      "half typed comment",
    );
  });

  it("keeps drafts of different tasks independent", () => {
    const { saveDraft } = useCommentDraftStore.getState();
    saveDraft(commentDraftKey("task-1"), "first task draft");
    saveDraft(commentDraftKey("task-2"), "second task draft");

    const { getDraft } = useCommentDraftStore.getState();
    expect(getDraft(commentDraftKey("task-1"))?.content).toBe(
      "first task draft",
    );
    expect(getDraft(commentDraftKey("task-2"))?.content).toBe(
      "second task draft",
    );
  });

  it("clears a draft without touching the others", () => {
    const { saveDraft } = useCommentDraftStore.getState();
    saveDraft(commentDraftKey("task-1"), "first task draft");
    saveDraft(commentDraftKey("task-2"), "second task draft");

    useCommentDraftStore.getState().clearDraft(commentDraftKey("task-1"));

    const { getDraft } = useCommentDraftStore.getState();
    expect(getDraft(commentDraftKey("task-1"))).toBeUndefined();
    expect(getDraft(commentDraftKey("task-2"))?.content).toBe(
      "second task draft",
    );
  });

  it("drops the draft when the composer is emptied again", () => {
    const key = commentDraftKey("task-1");
    useCommentDraftStore.getState().saveDraft(key, "half typed comment");
    useCommentDraftStore.getState().saveDraft(key, "");

    expect(useCommentDraftStore.getState().getDraft(key)).toBeUndefined();
  });

  it("does not create an entry for whitespace-only content", () => {
    const key = commentDraftKey("task-1");
    useCommentDraftStore.getState().saveDraft(key, "<p></p>");

    expect(useCommentDraftStore.getState().getDraft(key)).toBeUndefined();
    expect(useCommentDraftStore.getState().drafts).toEqual({});
  });

  it("clearing an unknown key is a no-op that keeps the same state object", () => {
    const before = useCommentDraftStore.getState().drafts;
    useCommentDraftStore.getState().clearDraft(commentDraftKey("nope"));

    expect(useCommentDraftStore.getState().drafts).toBe(before);
  });

  it("stamps savedAt so stale drafts can be reasoned about", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));
    const key = commentDraftKey("task-1");
    useCommentDraftStore.getState().saveDraft(key, "half typed comment");

    expect(useCommentDraftStore.getState().getDraft(key)?.savedAt).toBe(
      Date.parse("2026-01-02T03:04:05.000Z"),
    );
  });

  it("writes the draft to localStorage so it survives a reload", () => {
    const key = commentDraftKey("task-1");
    useCommentDraftStore.getState().saveDraft(key, "survives reload");

    const raw = localStorage.getItem(STORAGE_NAME);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).state.drafts[key].content).toBe(
      "survives reload",
    );
  });

  it("rehydrates drafts written by a previous page load", async () => {
    const key = commentDraftKey("task-7");
    localStorage.setItem(
      STORAGE_NAME,
      JSON.stringify({
        state: {
          drafts: { [key]: { content: "from last visit", savedAt: 1 } },
        },
        version: 0,
      }),
    );

    vi.resetModules();
    const reloaded = await import("@/lib/editor-comment-draft");

    expect(reloaded.default.getState().getDraft(key)?.content).toBe(
      "from last visit",
    );
  });
});
