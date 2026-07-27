import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Check,
  Edit3,
  Italic,
  Link2,
  Strikethrough,
  X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarkdownRenderer } from "@/components/public-board/markdown-renderer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type SlashCommand = {
  id: string;
  label: string;
  search: string;
  run: () => void;
};

type SlashMenu = {
  from: number;
  to: number;
  query: string;
  top: number;
  left: number;
  selectedIndex: number;
};

type RepoDescriptionEditorProps = {
  body: string;
  onSave: (markdown: string) => Promise<void>;
  isSaving?: boolean;
  placeholder?: string;
};

function normalizeMarkdown(markdown: string) {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n{2,}$/g, "\n");
}

/** A GitHub-compatible Markdown editor shared by repository issue and PR details. */
export function RepoDescriptionEditor({
  body,
  onSave,
  isSaving = false,
  placeholder = "Write a description…",
}: RepoDescriptionEditorProps) {
  const [editing, setEditing] = useState(false);
  const [slashMenu, setSlashMenu] = useState<SlashMenu | null>(null);
  const slashMenuRef = useRef<SlashMenu | null>(null);
  const externalBodyRef = useRef(body);

  const editor = useEditor({
    immediatelyRender: false,
    content: body,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Link.configure({
        autolink: true,
        defaultProtocol: "https",
        linkOnPaste: true,
        openOnClick: false,
      }),
      Markdown.configure({ markedOptions: { breaks: true, gfm: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
    ],
    editorProps: { attributes: { class: "kaneo-tiptap-prose min-h-56" } },
  });

  useEffect(() => {
    externalBodyRef.current = body;
    if (!editor || editing) return;
    const markdown = normalizeMarkdown(editor.getMarkdown());
    if (markdown !== body)
      editor.commands.setContent(body, { contentType: "markdown" });
  }, [body, editor, editing]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editing && !isSaving);
  }, [editor, editing, isSaving]);

  const syncSlashMenu = useCallback(() => {
    if (!editor || !editing) return;
    const { state, view } = editor;
    if (
      !state.selection.empty ||
      state.selection.$from.parent.type.name === "codeBlock"
    ) {
      setSlashMenu(null);
      return;
    }
    const { $from } = state.selection;
    const before = state.doc.textBetween($from.start(), $from.pos, "\n", "\0");
    const match = /(?:^|\s)\/([^\s/]*)$/.exec(before);
    if (!match) {
      setSlashMenu(null);
      return;
    }
    const coords = view.coordsAtPos($from.pos);
    const rect = view.dom.getBoundingClientRect();
    setSlashMenu({
      from: $from.pos - (match[1]?.length ?? 0) - 1,
      to: $from.pos,
      query: match[1] ?? "",
      top: coords.bottom - rect.top + 4,
      left: coords.left - rect.left,
      selectedIndex: 0,
    });
  }, [editor, editing]);

  useEffect(() => {
    if (!editor) return;
    editor.on("selectionUpdate", syncSlashMenu);
    editor.on("update", syncSlashMenu);
    return () => {
      editor.off("selectionUpdate", syncSlashMenu);
      editor.off("update", syncSlashMenu);
    };
  }, [editor, syncSlashMenu]);

  useEffect(() => {
    slashMenuRef.current = slashMenu;
  }, [slashMenu]);

  const commands = useMemo<SlashCommand[]>(() => {
    if (!editor) return [];
    const replace = (action: () => void) => () => {
      const range = slashMenuRef.current;
      if (!range) return;
      editor
        .chain()
        .focus()
        .deleteRange({ from: range.from, to: range.to })
        .run();
      action();
      setSlashMenu(null);
    };
    return [
      {
        id: "text",
        label: "Text",
        search: "paragraph normal",
        run: replace(() => editor.chain().setParagraph().run()),
      },
      {
        id: "heading",
        label: "Heading",
        search: "heading title h2",
        run: replace(() => editor.chain().toggleHeading({ level: 2 }).run()),
      },
      {
        id: "bullet",
        label: "Bulleted list",
        search: "list unordered bullet",
        run: replace(() => editor.chain().toggleBulletList().run()),
      },
      {
        id: "todo",
        label: "To-do list",
        search: "task todo checklist",
        run: replace(() => editor.chain().toggleTaskList().run()),
      },
      {
        id: "ordered",
        label: "Numbered list",
        search: "list ordered numbered",
        run: replace(() => editor.chain().toggleOrderedList().run()),
      },
      {
        id: "quote",
        label: "Quote",
        search: "blockquote",
        run: replace(() => editor.chain().toggleBlockquote().run()),
      },
      {
        id: "code",
        label: "Code block",
        search: "code snippet",
        run: replace(() => editor.chain().toggleCodeBlock().run()),
      },
    ];
  }, [editor]);
  const filteredCommands = commands.filter((command) => {
    const query = slashMenu?.query.toLowerCase() ?? "";
    return (
      !query ||
      command.label.toLowerCase().includes(query) ||
      command.search.includes(query)
    );
  });
  const filteredRef = useRef(filteredCommands);
  useEffect(() => {
    filteredRef.current = filteredCommands;
  });

  // The keydown listener lives on the editor surface: Tiptap owns focus, so a
  // wrapper with a role would fight the ProseMirror textbox semantics.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const menu = slashMenuRef.current;
    if (!menu) return;
    const items = filteredRef.current;
    if (event.key === "Escape") {
      event.preventDefault();
      setSlashMenu(null);
      return;
    }
    if (!items.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setSlashMenu((state) =>
        state
          ? {
              ...state,
              selectedIndex:
                (state.selectedIndex + delta + items.length) % items.length,
            }
          : state,
      );
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      items[menu.selectedIndex % items.length]?.run();
    }
  };

  const save = async () => {
    if (!editor) return;
    await onSave(normalizeMarkdown(editor.getMarkdown()));
    setEditing(false);
  };
  const cancel = () => {
    if (editor)
      editor.commands.setContent(externalBodyRef.current, {
        contentType: "markdown",
      });
    setSlashMenu(null);
    setEditing(false);
  };

  return (
    <section className="min-h-48 px-5 py-6 sm:px-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">Description</h2>
        {!editing && (
          <Button onClick={() => setEditing(true)} size="sm" variant="ghost">
            <Edit3 className="size-3.5" /> Edit
          </Button>
        )}
      </div>
      {editing ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: keystrokes originate in the nested ProseMirror textbox; this wrapper only routes slash-menu keys.
        <div className="kaneo-tiptap-shell relative" onKeyDown={handleKeyDown}>
          {editor && (
            <BubbleMenu
              editor={editor}
              className="kaneo-tiptap-bubble"
              shouldShow={({ from, to }) => from !== to}
            >
              <Button
                className={cn(
                  "kaneo-tiptap-bubble-btn",
                  editor.isActive("bold") && "bg-accent",
                )}
                onClick={() => editor.chain().focus().toggleBold().run()}
                size="xs"
                type="button"
                variant="ghost"
              >
                <Bold className="size-3.5" />
              </Button>
              <Button
                className={cn(
                  "kaneo-tiptap-bubble-btn",
                  editor.isActive("italic") && "bg-accent",
                )}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                size="xs"
                type="button"
                variant="ghost"
              >
                <Italic className="size-3.5" />
              </Button>
              <Button
                className={cn(
                  "kaneo-tiptap-bubble-btn",
                  editor.isActive("strike") && "bg-accent",
                )}
                onClick={() => editor.chain().focus().toggleStrike().run()}
                size="xs"
                type="button"
                variant="ghost"
              >
                <Strikethrough className="size-3.5" />
              </Button>
              <Button
                className={cn(
                  "kaneo-tiptap-bubble-btn",
                  editor.isActive("link") && "bg-accent",
                )}
                onClick={() => {
                  const href = window.prompt("URL");
                  if (href) editor.chain().focus().setLink({ href }).run();
                }}
                size="xs"
                type="button"
                variant="ghost"
              >
                <Link2 className="size-3.5" />
              </Button>
            </BubbleMenu>
          )}
          <EditorContent
            editor={editor}
            className="kaneo-tiptap-content rounded-md border bg-background px-3 py-2"
          />
          {slashMenu && (
            <div
              className="kaneo-tiptap-slash-menu"
              style={{
                left: slashMenu.left,
                position: "absolute",
                top: slashMenu.top,
              }}
            >
              {filteredCommands.length ? (
                filteredCommands.map((command, index) => (
                  <button
                    className={cn(
                      "kaneo-tiptap-slash-item",
                      index === slashMenu.selectedIndex && "is-selected",
                    )}
                    key={command.id}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      command.run();
                    }}
                    type="button"
                  >
                    {command.label}
                  </button>
                ))
              ) : (
                <div className="kaneo-tiptap-slash-empty">
                  No matching commands
                </div>
              )}
            </div>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button
              disabled={isSaving}
              onClick={cancel}
              size="sm"
              type="button"
              variant="outline"
            >
              <X className="size-3.5" /> Cancel
            </Button>
            <Button
              disabled={isSaving}
              onClick={() => void save()}
              size="sm"
              type="button"
            >
              <Check className="size-3.5" /> {isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : body ? (
        <MarkdownRenderer content={body} />
      ) : (
        <p className="text-sm italic text-muted-foreground">
          No description provided.
        </p>
      )}
    </section>
  );
}
