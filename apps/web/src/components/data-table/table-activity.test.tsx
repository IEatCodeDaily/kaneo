import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useCommentDraftStore from "@/lib/editor-comment-draft";
import type { DataTable, TableActivity } from "@/types/data-table";
import { TableActivityList } from "./table-activity";

const api = vi.hoisted(() => ({
  getTableActivity: vi.fn(),
  createTableComment: vi.fn(),
  revertTableActivity: vi.fn(),
  exportTableHistory: vi.fn(),
}));
vi.mock("@/fetchers/data-table/data-table", () => api);
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/format", () => ({
  formatDateMedium: (value: string) => value,
  formatRelativeTime: () => "now",
}));
vi.mock("@/components/activity/comment-editor", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      aria-label="Comment"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock("@/components/public-board/markdown-renderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const table = {
  id: "table",
  organizationId: "org",
  name: "Batches",
  fields: [],
  rows: [],
  total: 0,
} as unknown as DataTable;
const event = (id: string): TableActivity => ({
  id,
  type: "comment_added",
  rowId: "row",
  fieldId: null,
  data: { content: `Comment ${id}` },
  userId: null,
  userName: "Ayu",
  userImage: null,
  createdAt: "2026-11-15T12:00:00Z",
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  useCommentDraftStore.setState({ drafts: {} });
});
function mount(canEdit = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TableActivityList
        table={table}
        fields={[]}
        members={new Map()}
        rowId="row"
        canEdit={canEdit}
      />
    </QueryClientProvider>,
  );
  return client;
}
describe("table activity", () => {
  it("loads history beyond the first page while keeping row scope", async () => {
    api.getTableActivity.mockImplementation((_target, _row, offset) =>
      Promise.resolve(
        offset === 0
          ? Array.from({ length: 100 }, (_, i) => event(String(i)))
          : [event("older")],
      ),
    );
    mount();
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Load older activity|loadOlderActivity/i,
      }),
    );
    await screen.findByText("Comment older");
    expect(api.getTableActivity).toHaveBeenCalledWith(
      { organizationId: "org", tableId: "table" },
      "row",
      100,
      100,
    );
  });
  it("does not repeat an event when an append shifts the next offset page", async () => {
    const page = Array.from({ length: 100 }, (_, index) =>
      event(String(index)),
    );
    api.getTableActivity.mockImplementation((_target, _row, offset) =>
      Promise.resolve(offset === 100 ? [page[99], event("older")] : page),
    );
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: /loadOlderActivity/i }),
    );
    await screen.findByText("Comment older");
    expect(screen.getAllByText("Comment 99")).toHaveLength(1);
  });

  it("keeps a failed comment draft and does not offer a composer to viewers", async () => {
    api.getTableActivity.mockResolvedValue([]);
    api.createTableComment.mockRejectedValue(new Error("offline"));
    mount(true);
    const input = await screen.findByRole("textbox", { name: "Comment" });
    fireEvent.change(input, { target: { value: "Keep this draft" } });
    fireEvent.click(screen.getByTestId("comment-submit"));
    await waitFor(() =>
      expect(api.createTableComment).toHaveBeenCalledWith(
        { organizationId: "org", tableId: "table" },
        "Keep this draft",
        "row",
      ),
    );
    expect((input as HTMLTextAreaElement).value).toBe("Keep this draft");
    // The ticket drawer composer: draft-saved state, no task-only attach.
    expect(screen.getByTestId("comment-draft-status")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /attachFile/ })).toBeNull();
    cleanup();
    mount(false);
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Comment" })).toBeNull(),
    );
  });

  it("clears the shared composer and its persisted draft after posting", async () => {
    api.getTableActivity.mockResolvedValue([]);
    api.createTableComment.mockResolvedValue({});
    mount(true);
    const input = await screen.findByRole("textbox", { name: "Comment" });
    fireEvent.change(input, { target: { value: "Posted once" } });
    expect(JSON.stringify(useCommentDraftStore.getState().drafts)).toContain(
      "Posted once",
    );
    fireEvent.click(screen.getByTestId("comment-submit"));
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(""));
    expect(
      JSON.stringify(useCommentDraftStore.getState().drafts),
    ).not.toContain("Posted once");
  });
});
