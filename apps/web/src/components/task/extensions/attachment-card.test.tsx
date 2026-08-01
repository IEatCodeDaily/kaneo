import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttachmentCardView } from "./attachment-card";

afterEach(cleanup);

vi.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  ReactNodeViewRenderer: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

/**
 * The context-menu component has its own unit tests, but those render it
 * directly and therefore still pass if the attachment card stops using it.
 * This asserts the WIRING: right-clicking a real attachment card must open the
 * menu. Without it, unwrapping the card is a silent regression.
 */
describe("AttachmentCardView integration", () => {
  const node = {
    attrs: {
      url: "/api/asset/abc123",
      filename: "diagram.png",
      mimeType: "image/png",
      size: 2048,
    },
  };

  it("opens the attachment context menu on right-click", () => {
    // biome-ignore lint/suspicious/noExplicitAny: only node.attrs is read.
    render(<AttachmentCardView node={node as any} />);

    // Closed until asked for.
    expect(screen.queryByTestId("attachment-context-menu")).toBeNull();

    fireEvent.contextMenu(screen.getByTitle("diagram.png"));

    expect(screen.getByTestId("attachment-context-menu")).toBeTruthy();
    expect(screen.getByTestId("attachment-copy-address")).toBeTruthy();
  });
});
