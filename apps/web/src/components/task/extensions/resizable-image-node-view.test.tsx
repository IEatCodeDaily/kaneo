import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResizableImage } from "./resizable-image";

/**
 * #54: proves the image extension really mounts its React node view.
 *
 * The previous guard rendered `ResizableImageView` directly with
 * `@tiptap/react` MOCKED OUT. That passes even when the app registers plain
 * `@tiptap/extension-image` — which is exactly what happened twice: the context
 * menu and tooltip worked in the test and did not exist in the description
 * editor, because the description editor never registered this extension.
 *
 * Here a genuine editor renders the document through the real @tiptap/react
 * renderer, so "an inline image is right-clickable and has a tooltip" is an
 * observed DOM outcome rather than a claim about source text.
 */
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

afterEach(cleanup);

const CONTENT =
  '<p><img src="/api/asset/img-1" alt="Diagram" title="Diagram" width="320"></p>';

function Harness({ extensions }: { extensions: unknown[] }) {
  const editor = useEditor({
    immediatelyRender: true,
    // biome-ignore lint/suspicious/noExplicitAny: tiptap extension list
    extensions: [StarterKit, ...(extensions as any[])],
    content: CONTENT,
  });
  return <EditorContent editor={editor} />;
}

describe("#54 inline images mount a node view in a real editor", () => {
  it("renders the resizable wrapper, so right-click and tooltip exist", async () => {
    render(<Harness extensions={[ResizableImage]} />);

    // The wrapper carries the context menu and the title tooltip; a plain
    // <img> from @tiptap/extension-image produces neither.
    const wrapper = await waitFor(() =>
      screen.getByTestId("editor-image-wrapper"),
    );
    expect(wrapper.getAttribute("title")).toBe("Diagram");
    expect(
      screen.getByTestId("editor-image-resize-handle"),
    ).toBeInTheDocument();
    expect(screen.getByAltText("Diagram")).toBeInTheDocument();
  });

  it("keeps the `image` node name so saved descriptions still parse", async () => {
    render(<Harness extensions={[ResizableImage]} />);
    await waitFor(() => screen.getByTestId("editor-image-wrapper"));
    expect(ResizableImage.name).toBe("image");
  });

  it("preserves an explicit width so resizing survives a reload", async () => {
    render(<Harness extensions={[ResizableImage]} />);
    const image = await waitFor(() => screen.getByAltText("Diagram"));
    expect(image.style.width).toBe("320px");
  });
});
