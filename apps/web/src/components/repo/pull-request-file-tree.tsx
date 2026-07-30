import { FileTree, useFileTree } from "@pierre/trees/react";
import { FolderTree, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";

type PullRequestFileTreeProps = {
  filenames: string[];
  selectedPath: string | undefined;
  onSelect: (path: string) => void;
  /** Distinguishes the inline panel from the fullscreen one. */
  idPrefix: string;
  /** Controlled open state so the sidebar persists across file jumps. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Changed-files tree for a pull request, rendered as a **persistent, toggleable
 * floating sidebar** rather than a popup.
 *
 * A dismissing popover was the wrong shape: jumping to a file closed the tree,
 * so navigating several files meant reopening it every time. This stays open
 * while the reader moves through the diff, and floats over the diff surface so
 * the diff itself keeps full width.
 *
 * Reuses the Code Explorer's `@pierre/trees` FileTree so the pull request diff
 * and the repository browser share one tree implementation.
 */
export default function PullRequestFileTree({
  filenames,
  selectedPath,
  onSelect,
  idPrefix,
  open,
  onOpenChange,
}: PullRequestFileTreeProps) {
  // Directory paths must be present for @pierre/trees to nest children under a
  // folder; a bare list of file paths renders flat.
  const paths = useMemo(() => {
    const directories = new Set<string>();
    for (const filename of filenames) {
      const segments = filename.split("/");
      segments.pop();
      let prefix = "";
      for (const segment of segments) {
        prefix = prefix ? `${prefix}/${segment}` : segment;
        directories.add(`${prefix}/`);
      }
    }
    return [...[...directories].sort(), ...[...filenames].sort()];
  }, [filenames]);

  const { model } = useFileTree({
    itemHeight: 26,
    onSelectionChange: (selectedPaths) => {
      const file = selectedPaths.find((path) => !path.endsWith("/"));
      // Deliberately does not close the sidebar: the reader keeps navigating.
      if (file) onSelect(file);
    },
    paths: [],
  });

  useEffect(() => {
    model.resetPaths(paths);
  }, [model, paths]);

  useEffect(() => {
    if (!selectedPath) return;
    model.getItem(selectedPath)?.select();
  }, [model, selectedPath]);

  if (!open) {
    return (
      <Button
        aria-expanded={false}
        aria-label="Show changed files"
        className="gap-1.5"
        data-testid={`${idPrefix}-file-tree-toggle`}
        onClick={() => onOpenChange(true)}
        size="sm"
        variant="outline"
      >
        <FolderTree className="size-3.5" />
        {filenames.length} {filenames.length === 1 ? "file" : "files"}
      </Button>
    );
  }

  return (
    <aside
      aria-label="Changed files"
      className="w-72 shrink-0 rounded-md border border-border bg-popover shadow-md"
      data-testid={`${idPrefix}-file-tree-sidebar`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <FolderTree className="size-3.5" />
          {filenames.length} {filenames.length === 1 ? "file" : "files"}
        </span>
        <Button
          aria-expanded={true}
          aria-label="Hide changed files"
          data-testid={`${idPrefix}-file-tree-toggle`}
          onClick={() => onOpenChange(false)}
          size="icon-sm"
          variant="ghost"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div
        // The tree virtualizes against its own box, so it needs a resolved
        // height: with only max-height it collapses to zero and renders blank.
        className="h-[20rem] overflow-hidden p-1"
        data-testid={`${idPrefix}-file-tree`}
      >
        <FileTree className="h-full" model={model} />
      </div>
    </aside>
  );
}
