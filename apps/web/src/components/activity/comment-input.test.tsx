import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createCommentMock = vi.fn();
const invalidateQueriesMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

// The real editor is a full tiptap instance (ProseMirror, shiki, uploads) and
// cannot mount under jsdom. The draft contract only needs value/onChange.
vi.mock("@/components/activity/comment-editor", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange?: (next: string) => void;
  }) => (
    <textarea
      data-testid="comment-editor"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

vi.mock("@/hooks/mutations/comment/use-create-comment", () => ({
  default: () => ({ mutateAsync: createCommentMock, isPending: false }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import CommentInput from "@/components/activity/comment-input";
import useCommentDraftStore, {
  commentDraftKey,
} from "@/lib/editor-comment-draft";

function editor() {
  return screen.getByTestId("comment-editor") as HTMLTextAreaElement;
}

function type(text: string) {
  fireEvent.change(editor(), { target: { value: text } });
}

describe("CommentInput draft persistence", () => {
  beforeEach(() => {
    createCommentMock.mockReset().mockResolvedValue({});
    invalidateQueriesMock.mockReset().mockResolvedValue(undefined);
    localStorage.clear();
    useCommentDraftStore.setState({ drafts: {} });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    useCommentDraftStore.setState({ drafts: {} });
  });

  it("persists a half-typed comment as a draft for that task", () => {
    render(<CommentInput taskId="task-1" />);
    type("half typed");

    expect(
      useCommentDraftStore.getState().getDraft(commentDraftKey("task-1"))
        ?.content,
    ).toBe("half typed");
  });

  it("restores the draft when the composer is remounted (drawer reopened)", () => {
    render(<CommentInput taskId="task-1" />);
    type("half typed");
    cleanup();

    render(<CommentInput taskId="task-1" />);

    expect(editor().value).toBe("half typed");
  });

  it("does not leak a draft from one task into another task's composer", () => {
    render(<CommentInput taskId="task-1" />);
    type("task one draft");
    cleanup();

    render(<CommentInput taskId="task-2" />);

    expect(editor().value).toBe("");
  });

  it("clears the draft after a successful submit", async () => {
    render(<CommentInput taskId="task-1" />);
    type("ready to send");

    const submit = screen
      .getAllByRole("button")
      .find((button) => !button.hasAttribute("disabled")) as HTMLElement;
    fireEvent.click(submit);
    await waitFor(() =>
      expect(createCommentMock).toHaveBeenCalledWith({
        taskId: "task-1",
        comment: "ready to send",
      }),
    );

    await waitFor(() =>
      expect(
        useCommentDraftStore.getState().getDraft(commentDraftKey("task-1")),
      ).toBeUndefined(),
    );
    await waitFor(() => expect(editor().value).toBe(""));
  });

  it("keeps the draft when submitting fails so nothing is lost", async () => {
    createCommentMock.mockRejectedValue(new Error("network down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<CommentInput taskId="task-1" />);
    type("should survive a failure");

    const submit = screen
      .getAllByRole("button")
      .find((button) => !button.hasAttribute("disabled")) as HTMLElement;
    fireEvent.click(submit);
    await waitFor(() => expect(createCommentMock).toHaveBeenCalled());

    expect(
      useCommentDraftStore.getState().getDraft(commentDraftKey("task-1"))
        ?.content,
    ).toBe("should survive a failure");
  });

  it("drops the draft when the user clears the composer by hand", () => {
    render(<CommentInput taskId="task-1" />);
    type("half typed");
    type("");

    expect(
      useCommentDraftStore.getState().getDraft(commentDraftKey("task-1")),
    ).toBeUndefined();
  });
});
