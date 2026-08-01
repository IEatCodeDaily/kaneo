import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useCommentDraftStore, {
  commentDraftKey,
} from "@/lib/editor-comment-draft";
import CommentInput from "../comment-input";

/**
 * #100: an unsent comment must come back when the drawer is reopened.
 *
 * The previous guard tested the draft *store* and passed while the feature was
 * broken end to end: the draft was written to localStorage correctly, but the
 * composer restored it in a `useEffect`, one render after the editor had
 * already hydrated its document with "". The editor hydrates once, so the
 * restored text was discarded and the box came back empty.
 *
 * These mount the real composer and assert the value the editor actually
 * receives, which is where the bug lived.
 */

const editorValues: string[] = [];

vi.mock("@/components/activity/comment-editor", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange?: (next: string) => void;
  }) => {
    editorValues.push(value);
    return (
      <textarea
        data-testid="comment-editor"
        onChange={(event) => onChange?.(event.target.value)}
        value={value}
      />
    );
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks/mutations/comment/use-create-comment", () => ({
  default: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const TASK = "task-1";

beforeEach(() => {
  editorValues.length = 0;
  useCommentDraftStore.setState({ drafts: {} });
});

afterEach(cleanup);

describe("#100 comment draft restore", () => {
  it("hands the persisted draft to the editor on the FIRST render", () => {
    useCommentDraftStore
      .getState()
      .saveDraft(commentDraftKey(TASK), "unsent thought");

    render(<CommentInput taskId={TASK} />);

    // The very first value the editor sees must already be the draft — a later
    // update is too late, the editor has hydrated by then.
    expect(editorValues[0]).toBe("unsent thought");
    expect(screen.getByTestId("comment-editor")).toHaveValue("unsent thought");
  });

  // NEGATIVE CONTROL: without a draft the composer must start empty, otherwise
  // the assertion above could pass on stale state.
  it("starts empty when there is no draft", () => {
    render(<CommentInput taskId={TASK} />);
    expect(editorValues[0]).toBe("");
  });

  /**
   * The bug that survived the first fix: the editor emits an empty onChange
   * while hydrating its document, and saveDraft DELETES on empty. That wiped
   * the stored draft before the user typed a character — observed live as
   * `{"drafts":{}}` in localStorage immediately after focusing the composer.
   */
  it("does not let the editor's hydration blank wipe a stored draft", () => {
    useCommentDraftStore
      .getState()
      .saveDraft(commentDraftKey(TASK), "unsent thought");

    render(<CommentInput taskId={TASK} />);
    // Simulate the editor reporting an empty document during hydration.
    fireEvent.change(screen.getByTestId("comment-editor"), {
      target: { value: "" },
    });

    expect(
      useCommentDraftStore.getState().getDraft(commentDraftKey(TASK))?.content,
    ).toBe("unsent thought");
  });

  it("still clears the draft when the user really empties the box", () => {
    render(<CommentInput taskId={TASK} />);
    const editor = screen.getByTestId("comment-editor");

    fireEvent.change(editor, { target: { value: "typed" } });
    expect(
      useCommentDraftStore.getState().getDraft(commentDraftKey(TASK)),
    ).toBeDefined();

    fireEvent.change(editor, { target: { value: "" } });
    expect(
      useCommentDraftStore.getState().getDraft(commentDraftKey(TASK)),
    ).toBeUndefined();
  });

  it("persists what the user types", () => {
    render(<CommentInput taskId={TASK} />);
    fireEvent.change(screen.getByTestId("comment-editor"), {
      target: { value: "typed text" },
    });

    expect(
      useCommentDraftStore.getState().getDraft(commentDraftKey(TASK))?.content,
    ).toBe("typed text");
  });
});

describe("#100 draft status and delete control", () => {
  it("shows no draft status for an empty composer", () => {
    render(<CommentInput taskId={TASK} />);
    expect(screen.queryByTestId("comment-draft-status")).toBeNull();
    expect(screen.queryByTestId("comment-draft-delete")).toBeNull();
  });

  it("shows the saved status once there is content", () => {
    render(<CommentInput taskId={TASK} />);
    fireEvent.change(screen.getByTestId("comment-editor"), {
      target: { value: "something" },
    });

    expect(screen.getByTestId("comment-draft-status")).toBeInTheDocument();
    expect(screen.getByTestId("comment-draft-delete")).toBeInTheDocument();
  });

  it("clears the editor and the stored draft when deleted", () => {
    useCommentDraftStore.getState().saveDraft(commentDraftKey(TASK), "junk");
    render(<CommentInput taskId={TASK} />);

    fireEvent.click(screen.getByTestId("comment-draft-delete"));

    expect(screen.getByTestId("comment-editor")).toHaveValue("");
    expect(
      useCommentDraftStore.getState().getDraft(commentDraftKey(TASK)),
    ).toBeUndefined();
    // The control disappears with the draft it was acting on.
    expect(screen.queryByTestId("comment-draft-delete")).toBeNull();
  });

  it("does not treat whitespace-only markup as a draft", () => {
    render(<CommentInput taskId={TASK} />);
    fireEvent.change(screen.getByTestId("comment-editor"), {
      target: { value: "<p>   </p>" },
    });

    expect(screen.queryByTestId("comment-draft-status")).toBeNull();
  });
});
