import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CommentEditor from "./comment-editor";

vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: null }),
}));

/**
 * KFL-330: stored markdown is
 *   LINEA\n\nLINEB\n\nLINEC\n\n \n\nLINED
 * (verified in the DB), yet the read-only viewer renders
 *   <p>LINEA<br>LINEB<br>LINEC</p><p>LINED</p>
 * — blank lines gone. This drives the REAL component (readOnly) so whatever
 * mangles the content must show up here.
 */
afterEach(cleanup);

describe("CommentEditor read-only blank-line fidelity", () => {
  it("renders blank-line-separated lines as distinct paragraphs", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <CommentEditor
          value={"LINEA\n\nLINEB\n\nLINEC\n\n \n\nLINED"}
          readOnly
          taskId="task-1"
        />
      </QueryClientProvider>,
    );

    const pm = container.querySelector(".ProseMirror");
    expect(pm).toBeTruthy();
    const html = pm?.innerHTML ?? "";
    console.log("VIEWER HTML:", JSON.stringify(html));

    // The only <br> allowed is TipTap's own trailing break marker.
    const brs = (html.match(/<br/g) ?? []).filter(
      (m, i) => !html.slice(html.indexOf(m)).includes("trailingBreak"),
    );
    expect(brs.length).toBe(0);
    expect((html.match(/LINEA<\/p><p>/g) ?? []).length).toBe(1);
    expect((html.match(/<p/g) ?? []).length).toBe(5);
  });
});
