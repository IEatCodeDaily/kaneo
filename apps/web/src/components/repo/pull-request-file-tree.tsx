import { FileTree, useFileTree } from "@pierre/trees/react";
import { FolderTree } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type PullRequestFileTreeProps = {
  filenames: string[];
  selectedPath: string | undefined;
  onSelect: (path: string) => void;
  /** Distinguishes the inline panel from the fullscreen one. */
  idPrefix: string;
};

/**
 * Floating changed-files tree for a pull request.
 *
 * Reuses the Code Explorer's `@pierre/trees` FileTree so the pull request diff
 * and the repository browser share one tree implementation — the flat button
 * list this replaced could not express folders at all.
 *
 * It renders inside a portalled Popover rather than an absolutely positioned
 * div: the diff renderer is a custom element that paints above in-flow siblings
 * regardless of z-index, which made an in-flow panel's folders unclickable.
 */
export default function PullRequestFileTree({
  filenames,
  selectedPath,
  onSelect,
  idPrefix,
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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label="Toggle changed files tree"
          className="gap-1.5"
          size="sm"
          variant="outline"
        >
          <FolderTree className="size-3.5" />
          {filenames.length} {filenames.length === 1 ? "file" : "files"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1">
        <section
          aria-label="Changed files"
          // The tree virtualizes against its own box, so it needs a resolved
          // height: with only max-height it collapses to zero and renders blank.
          className="h-[20rem] overflow-hidden"
          data-testid={`${idPrefix}-file-tree`}
        >
          <FileTree className="h-full" model={model} />
        </section>
      </PopoverContent>
    </Popover>
  );
}
