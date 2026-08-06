import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  Folder,
  GitBranch,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import RepoLayout from "@/components/common/repo-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import PageTitle from "@/components/page-title";
import { MarkdownRenderer } from "@/components/public-board/markdown-renderer";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import useGetRepo from "@/hooks/queries/repo/use-get-repo";
import useGetRepoContents from "@/hooks/queries/repo/use-get-repo-contents";
import { getSharedShikiHighlighter } from "@/lib/shiki-highlighter";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId/repo/$repoId/code",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>) => ({
    path: typeof search.path === "string" ? search.path : "",
    ref: typeof search.ref === "string" ? search.ref : undefined,
  }),
});

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function languageForPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  const languages: Record<string, string> = {
    c: "cpp",
    cc: "cpp",
    cpp: "cpp",
    css: "css",
    go: "go",
    htm: "html",
    html: "html",
    java: "java",
    js: "javascript",
    json: "json",
    jsx: "javascript",
    md: "markdown",
    mjs: "javascript",
    py: "python",
    rs: "rust",
    sh: "bash",
    sql: "sql",
    toml: "toml",
    ts: "typescript",
    tsx: "typescript",
    txt: "text",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
  };
  return languages[extension ?? ""] ?? "text";
}

function isRichFile(path: string) {
  return /\.(md|mdx|html?)$/i.test(path);
}

/** One directory level. Children mount only when expanded, so collapsing a
 *  folder or picking a file never refetches the rest of the tree. */
function TreeLevel({
  repoId,
  path,
  gitRef,
  depth,
  selectedPath,
  onSelect,
}: {
  repoId: string;
  path: string;
  gitRef?: string;
  depth: number;
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  const { data, isLoading } = useGetRepoContents({ repoId, path, ref: gitRef });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (isLoading) {
    return (
      <div className="space-y-1 py-1" style={{ paddingLeft: depth * 12 + 8 }}>
        {[1, 2, 3].map((item) => (
          <Skeleton className="h-5 w-32" key={item} />
        ))}
      </div>
    );
  }

  const entries = data?.type === "directory" ? data.entries : [];

  return (
    <ul className="list-none">
      {entries.map((entry) => {
        const isDir = entry.type === "dir";
        const isOpen = Boolean(expanded[entry.path]);
        const isActive = selectedPath === entry.path;
        return (
          <li key={entry.path}>
            <button
              className={`group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm transition-colors ${
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground/80 hover:bg-accent/50"
              }`}
              onClick={() =>
                isDir
                  ? setExpanded((state) => ({
                      ...state,
                      [entry.path]: !state[entry.path],
                    }))
                  : onSelect(entry.path)
              }
              style={{ paddingLeft: depth * 12 + 8 }}
              type="button"
            >
              {isDir ? (
                isOpen ? (
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                )
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              {isDir ? (
                <Folder className="size-4 shrink-0 text-blue-500" />
              ) : (
                <File className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            </button>
            {isDir && isOpen && (
              <TreeLevel
                depth={depth + 1}
                gitRef={gitRef}
                onSelect={onSelect}
                path={entry.path}
                repoId={repoId}
                selectedPath={selectedPath}
              />
            )}
          </li>
        );
      })}
      {entries.length === 0 && (
        <li
          className="py-1.5 text-xs text-muted-foreground"
          style={{ paddingLeft: depth * 12 + 8 }}
        >
          Empty directory
        </li>
      )}
    </ul>
  );
}

function FileContent({
  content,
  path,
  rich,
}: {
  content: string;
  path: string;
  rich: boolean;
}) {
  const [highlighted, setHighlighted] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHighlighted(null);
    const isDark = document.documentElement.classList.contains("dark");
    void getSharedShikiHighlighter().then((highlighter) => {
      if (cancelled) return;
      // Shiki inlines its theme background, which clashes with the app surface.
      const html = highlighter
        .codeToHtml(content, {
          lang: languageForPath(path),
          theme: isDark ? "github-dark" : "github-light",
        })
        .replace(/background-color:[^;"]*;?/g, "");
      setHighlighted(html);
    });
    return () => {
      cancelled = true;
    };
  }, [content, path]);

  if (rich) {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none px-5 py-4">
        <MarkdownRenderer content={content} />
      </div>
    );
  }

  return highlighted ? (
    <div
      className="overflow-x-auto px-4 py-3 text-xs leading-5 [&_code]:!bg-transparent [&_pre]:!bg-transparent [&_pre]:m-0"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output is generated from repository text we fetched.
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  ) : (
    <pre className="overflow-x-auto px-4 py-3 text-xs leading-5">
      <code>{content}</code>
    </pre>
  );
}

function RouteComponent() {
  const { organizationId, repoId } = Route.useParams();
  const { path, ref } = Route.useSearch();
  const { data: repo } = useGetRepo({ id: repoId });
  const [selectedPath, setSelectedPath] = useState(path);
  const current = useGetRepoContents({ repoId, path: selectedPath, ref });
  const [view, setView] = useState<"source" | "render">("source");

  const repoTitle = repo ? `${repo.owner}/${repo.name}` : repoId;
  const file = current.data?.type === "file" ? current.data.file : null;
  const richAvailable = Boolean(file && isRichFile(file.path));

  useEffect(() => {
    setSelectedPath(path);
  }, [path]);
  useEffect(() => {
    setView("source");
  }, [selectedPath]);

  return (
    <>
      <PageTitle title={`${repoTitle} · Code`} />
      <RepoLayout organizationId={organizationId} repoId={repoId}>
        <div className="flex h-[calc(100vh-8rem)] w-full flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
              {selectedPath || repoTitle}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <GitBranch className="size-3.5" />
              {ref || repo?.defaultBranch || "default branch"}
            </span>
          </div>

          <div className="flex min-h-0 flex-1">
            <aside
              aria-label="File explorer"
              className="w-64 shrink-0 overflow-y-auto border-r py-2 pr-1 pl-1"
            >
              <ErrorBoundary
                fallbackDescription="The file tree could not be rendered. You can still reload to retry."
                fallbackTitle="File explorer unavailable"
              >
                <TreeLevel
                  depth={0}
                  gitRef={ref}
                  onSelect={setSelectedPath}
                  path=""
                  repoId={repoId}
                  selectedPath={selectedPath}
                />
              </ErrorBoundary>
            </aside>

            <section className="min-w-0 flex-1 overflow-y-auto">
              <ErrorBoundary
                className="m-4"
                fallbackDescription="This file could not be rendered. Pick another file or retry."
                fallbackTitle="File preview unavailable"
              >
                {current.error ? (
                  <Empty className="min-h-64">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <TriangleAlert />
                      </EmptyMedia>
                      <EmptyTitle>Unable to load this path</EmptyTitle>
                      <EmptyDescription>
                        {current.error.message}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : current.isLoading ? (
                  <div className="space-y-2 p-4">
                    {[1, 2, 3, 4, 5, 6].map((item) => (
                      <Skeleton className="h-4 w-full" key={item} />
                    ))}
                  </div>
                ) : file ? (
                  <>
                    <div className="sticky top-0 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-4 py-2 text-xs text-muted-foreground backdrop-blur">
                      <span className="flex min-w-0 items-center gap-1.5 truncate">
                        <FileCode2 className="size-3.5" />
                        {file.path}
                      </span>
                      <span className="flex items-center gap-3">
                        <span>{formatBytes(file.size)}</span>
                        {richAvailable && (
                          <span className="flex items-center gap-1">
                            <Button
                              onClick={() => setView("source")}
                              size="xs"
                              variant={
                                view === "source" ? "secondary" : "ghost"
                              }
                            >
                              Source
                            </Button>
                            <Button
                              onClick={() => setView("render")}
                              size="xs"
                              variant={
                                view === "render" ? "secondary" : "ghost"
                              }
                            >
                              Preview
                            </Button>
                          </span>
                        )}
                      </span>
                    </div>
                    {file.isBinary || !file.content ? (
                      <Empty className="min-h-64">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <File />
                          </EmptyMedia>
                          <EmptyTitle>Binary file</EmptyTitle>
                          <EmptyDescription>
                            This file cannot be displayed as text.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    ) : (
                      <FileContent
                        content={file.content}
                        path={file.path}
                        rich={view === "render" && richAvailable}
                      />
                    )}
                  </>
                ) : (
                  <Empty className="min-h-64">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <FileCode2 />
                      </EmptyMedia>
                      <EmptyTitle>Select a file</EmptyTitle>
                      <EmptyDescription>
                        Choose a file in the explorer to view its contents.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </ErrorBoundary>
            </section>
          </div>
        </div>
      </RepoLayout>
    </>
  );
}
