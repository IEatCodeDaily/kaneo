import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import ReferenceList, {
  type ReferenceItem,
  type ReferenceListRef,
} from "./reference-list";

type ReferenceSuggestionOptions = {
  /**
   * Resolves `#query` to referenceable items. Async because tasks, issues and
   * pull requests are searched server-side rather than held in memory.
   */
  search: (query: string) => Promise<ReferenceItem[]>;
};

/**
 * Adds a `#`-triggered autocomplete for Kaneo tasks and GitHub issues / pull
 * requests.
 *
 * `@` is already taken by member mentions, so `#` follows the convention users
 * know from GitHub. Selecting an item inserts a `kaneoIssueLink` node — the same
 * node the editor already renders with a hover preview — so references get rich
 * rendering and Markdown round-tripping for free instead of a second node type.
 */
export const ReferenceSuggestion = Extension.create<ReferenceSuggestionOptions>(
  {
    name: "kaneoReferenceSuggestion",

    addOptions() {
      return { search: async () => [] };
    },

    addProseMirrorPlugins() {
      const search = this.options.search;

      const suggestion: Omit<SuggestionOptions, "editor"> = {
        char: "#",
        pluginKey: new PluginKey("kaneoReferenceSuggestion"),
        allowSpaces: false,
        items: ({ query }) => search(query),
        command: ({ editor, range, props }) => {
          const item = props as unknown as ReferenceItem;
          const issueKey =
            item.number === null ? item.scope : `${item.scope}#${item.number}`;
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: "kaneoIssueLink",
                attrs: {
                  issueKey,
                  url: item.url,
                  taskId: item.kind === "task" ? item.id : "",
                },
              },
              { type: "text", text: " " },
            ])
            .run();
        },
        render: () => {
          let component: ReactRenderer<ReferenceListRef> | null = null;
          let popup: HTMLDivElement | null = null;

          const place = (clientRect?: (() => DOMRect | null) | null) => {
            if (!popup || !clientRect) return;
            const rect = clientRect();
            if (!rect) return;
            popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
            popup.style.left = `${rect.left + window.scrollX}px`;
          };

          return {
            onStart: (props) => {
              component = new ReactRenderer(ReferenceList, {
                props,
                editor: props.editor,
              });
              popup = document.createElement("div");
              popup.className = "kaneo-mention-popup";
              popup.appendChild(component.element);
              document.body.appendChild(popup);
              place(props.clientRect);
            },
            onUpdate: (props) => {
              component?.updateProps(props);
              place(props.clientRect);
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") return false;
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              popup?.remove();
              popup = null;
              component?.destroy();
              component = null;
            },
          };
        },
      };

      return [Suggestion({ editor: this.editor, ...suggestion })];
    },
  },
);

export default ReferenceSuggestion;
