import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResizableImageView } from "./resizable-image";

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
describe("ResizableImageView integration", () => {
  it("opens the attachment menu and removes an inline image", () => {
    const run = vi.fn();
    const deleteRange = vi.fn(() => ({ run }));
    const editor = {
      chain: () => ({ focus: () => ({ deleteRange }) }),
      isEditable: true,
    };
    const node = {
      attrs: { src: "/api/asset/image-1", alt: "Architecture", width: 320 },
      nodeSize: 1,
    };
    render(
      <ResizableImageView
        editor={editor as any}
        getPos={() => 11}
        node={node as any}
        selected={false}
      />,
    );
    fireEvent.contextMenu(screen.getByAltText("Architecture"));
    expect(screen.getByTestId("attachment-context-menu")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("attachment-remove"));
    expect(deleteRange).toHaveBeenCalledWith({ from: 11, to: 12 });
    expect(run).toHaveBeenCalledOnce();
  });
});
