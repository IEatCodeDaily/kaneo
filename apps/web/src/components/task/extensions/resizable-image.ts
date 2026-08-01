import type { NodeViewRenderer, NodeViewRendererProps } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import type { NodeView } from "@tiptap/pm/view";
import {
  clampImageWidth,
  imageTooltip,
  imageWrapperClass,
  MIN_IMAGE_WIDTH,
} from "@/lib/editor-image-resize";

/**
 * The bundled `Image` extension with a selected state, a tooltip and a drag
 * handle for resizing.
 *
 * Implemented as a plain ProseMirror node view rather than a React node view:
 * the editors already render dozens of images per description and a React tree
 * per image (plus its own re-render cycle on every drag frame) is far more
 * machinery than an outline and a corner handle warrant.
 *
 * `width` is stored on the node and rendered as an inline style so it
 * round-trips through the existing HTML/Markdown serialization.
 */
export const ResizableImage = Image.extend({
  name: "image",

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null as number | null,
        parseHTML: (element) => {
          const raw =
            element.getAttribute("width") ||
            (element as HTMLElement).style?.width ||
            "";
          const parsed = Number.parseInt(String(raw), 10);
          return Number.isFinite(parsed) ? parsed : null;
        },
        renderHTML: (attributes) => {
          const width = attributes.width as number | null;
          if (!width) return {};
          return { width: String(width), style: `width: ${width}px` };
        },
      },
    };
  },

  addNodeView() {
    const nodeViewConstructor: NodeViewRenderer = (
      props: NodeViewRendererProps,
    ) => {
      const { node, editor, getPos } = props;

      const wrapper = document.createElement("span");
      wrapper.className = imageWrapperClass(false);
      wrapper.setAttribute("data-testid", "editor-image-wrapper");

      const image = document.createElement("img");
      image.className = "kaneo-editor-image";
      image.loading = "lazy";
      image.draggable = false;

      const handle = document.createElement("span");
      handle.className = "kaneo-editor-image-resize-handle";
      handle.setAttribute("data-testid", "editor-image-resize-handle");
      handle.setAttribute("aria-hidden", "true");
      handle.contentEditable = "false";

      wrapper.append(image, handle);

      const applyAttributes = (currentNode: typeof node) => {
        const attrs = currentNode.attrs as {
          src?: string;
          alt?: string | null;
          title?: string | null;
          width?: number | null;
        };
        image.setAttribute("src", attrs.src || "");
        image.setAttribute("alt", attrs.alt || "");
        const tooltip = imageTooltip(attrs.title, attrs.alt, attrs.src || "");
        image.setAttribute("title", tooltip);
        wrapper.setAttribute("title", tooltip);
        if (attrs.width) {
          image.style.width = `${attrs.width}px`;
          image.setAttribute("width", String(attrs.width));
        } else {
          image.style.removeProperty("width");
          image.removeAttribute("width");
        }
      };

      applyAttributes(node);

      let dragStartX = 0;
      let dragStartWidth = 0;
      let dragging = false;

      const onPointerMove = (event: PointerEvent) => {
        if (!dragging) return;
        const next = clampImageWidth(
          dragStartWidth + (event.clientX - dragStartX),
          wrapper.parentElement?.clientWidth || undefined,
        );
        image.style.width = `${next}px`;
      };

      const commitWidth = () => {
        if (!dragging) return;
        dragging = false;
        wrapper.classList.remove("is-resizing");
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", commitWidth);

        const width = clampImageWidth(Number.parseInt(image.style.width, 10));
        const pos = typeof getPos === "function" ? getPos() : null;
        if (pos === null || pos === undefined) return;
        editor.view.dispatch(
          editor.view.state.tr.setNodeMarkup(pos, undefined, {
            ...editor.view.state.doc.nodeAt(pos)?.attrs,
            width,
          }),
        );
      };

      const onPointerDown = (event: PointerEvent) => {
        if (!editor.isEditable) return;
        event.preventDefault();
        event.stopPropagation();
        dragging = true;
        dragStartX = event.clientX;
        dragStartWidth =
          image.getBoundingClientRect().width ||
          (node.attrs.width as number | null) ||
          MIN_IMAGE_WIDTH;
        wrapper.classList.add("is-resizing");
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", commitWidth);
      };

      handle.addEventListener("pointerdown", onPointerDown);

      const view: NodeView = {
        dom: wrapper,
        // Resizing mutates inline styles and the handle; ProseMirror must not
        // read those DOM changes back as document edits.
        ignoreMutation: () => true,
        selectNode() {
          wrapper.className = imageWrapperClass(true);
          wrapper.setAttribute("data-selected", "true");
        },
        deselectNode() {
          wrapper.className = imageWrapperClass(false);
          wrapper.removeAttribute("data-selected");
        },
        update(updatedNode) {
          if (updatedNode.type.name !== "image") return false;
          applyAttributes(updatedNode);
          return true;
        },
        destroy() {
          handle.removeEventListener("pointerdown", onPointerDown);
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", commitWidth);
        },
      };

      return view;
    };

    return nodeViewConstructor;
  },
});

export default ResizableImage;
