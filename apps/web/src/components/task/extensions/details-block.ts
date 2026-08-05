import { mergeAttributes, Node } from "@tiptap/core";

/**
 * Collapsible `<details>` / `<summary>` sections.
 *
 * GitHub issue and PR bodies routinely use raw `<details>` HTML for collapsible
 * sections — CodeRabbit-style review plans, "Prompt for AI agents" blocks,
 * long logs. StarterKit has no node for it, so `@tiptap/markdown` dropped the
 * wrapper entirely and every section rendered flat: the summary became an
 * ordinary paragraph, indistinguishable from the body it was supposed to hide.
 *
 * Three nodes, mirroring the HTML shape so parse and serialize round-trip:
 *   details        - block container, holds a summary plus arbitrary content
 *   detailsSummary - the always-visible clickable label
 *   detailsContent - the collapsible body
 *
 * Rendering uses the real `<details>`/`<summary>` elements so the browser
 * supplies the open/close behaviour natively — no JS, works read-only, and
 * keyboard/AT support comes for free.
 */

export const DetailsSummary = Node.create({
  name: "detailsSummary",
  content: "inline*",
  group: "block",
  defining: true,
  // A summary is part of its details wrapper; letting it be dragged or split
  // out on its own would orphan it.
  isolating: true,

  parseHTML() {
    return [{ tag: "summary" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "summary",
      mergeAttributes(HTMLAttributes, {
        class: "kaneo-details-summary",
      }),
      0,
    ];
  },
});

export const DetailsContent = Node.create({
  name: "detailsContent",
  // Anything that can appear in a document body can appear inside the fold.
  content: "block+",
  group: "block",
  defining: true,

  parseHTML() {
    // `<details>` children other than `<summary>` are the body. There is no
    // dedicated element for it in the HTML spec, so we accept an explicit
    // wrapper div and otherwise let the details node hoist loose children.
    return [{ tag: "div[data-details-content]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-details-content": "",
        class: "kaneo-details-content",
      }),
      0,
    ];
  },
});

export const Details = Node.create({
  name: "details",
  content: "detailsSummary detailsContent",
  group: "block",
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element) => element.hasAttribute("open"),
        renderHTML: (attributes) => (attributes.open ? { open: "" } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "details",
        // Loose children (a `<summary>` followed by bare paragraphs, which is
        // exactly what GitHub bodies contain) need wrapping into the
        // detailsContent node. TipTap cannot express that with a plain tag
        // match, so normalise the DOM before it is parsed.
        getContent: undefined,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "details",
      mergeAttributes(HTMLAttributes, { class: "kaneo-details" }),
      0,
    ];
  },
});

/**
 * Wrap the loose body children of every `<details>` in a `detailsContent`
 * element so the strict `detailsSummary detailsContent` schema can match.
 *
 * Exported for direct testing: the transform is the part most likely to break
 * on unusual GitHub markup, and it is pure DOM in / DOM out.
 */
export function normalizeDetailsHtml(html: string): string {
  // Guard for non-DOM environments (SSR, node tests without jsdom).
  if (typeof DOMParser === "undefined") return html;
  if (!html.includes("<details")) return html;

  const doc = new DOMParser().parseFromString(html, "text/html");

  for (const details of Array.from(doc.querySelectorAll("details"))) {
    // Skip anything already normalised.
    if (details.querySelector(":scope > [data-details-content]")) continue;

    const summary = details.querySelector(":scope > summary");
    const wrapper = doc.createElement("div");
    wrapper.setAttribute("data-details-content", "");

    for (const child of Array.from(details.childNodes)) {
      if (child === summary) continue;
      wrapper.appendChild(child);
    }

    // A details with no body still needs the content node to satisfy the
    // schema, otherwise the whole block is dropped again.
    if (!wrapper.childNodes.length) {
      wrapper.appendChild(doc.createElement("p"));
    }

    // An absent summary would also fail the schema; synthesise an empty one.
    if (!summary) {
      details.appendChild(doc.createElement("summary"));
    }

    details.appendChild(wrapper);
  }

  return doc.body.innerHTML;
}

export const DetailsExtensions = [Details, DetailsSummary, DetailsContent];

export default DetailsExtensions;
