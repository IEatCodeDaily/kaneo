import { Link, createFileRoute } from "@tanstack/react-router";
import { File, FileCode2, Folder, GitBranch, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import PageTitle from "@/components/page-title";
import RepoLayout from "@/components/common/repo-layout";
import { MarkdownRenderer } from "@/components/public-board/markdown-renderer";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import useGetRepo from "@/hooks/queries/repo/use-get-repo";
import useGetRepoContents from "@/hooks/queries/repo/use-get-repo-contents";
import { getSharedShikiHighlighter } from "@/lib/shiki-highlighter";
import type { RepoContentEntry } from "@/types/repo";

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
    c: "cpp", cc: "cpp", cpp: "cpp", css: "css", go: "go", htm: "html",
    html: "html", java: "java", js: "javascript", jsx: "javascript", json: "json",
    md: "markdown", mjs: "javascript", py: "python", rs: "rust", sh: "bash",
    sql: "sql", toml: "toml", ts: "typescript", tsx: "typescript", xml: "xml",
    yml: "yaml", yaml: "yaml",
  };
  return languages[extension ?? ""] ?? "text";
}

function isRichFile(path: string) {
  return /\.(md|mdx|html?|svg)$/i.test(path);
}

function ExplorerEntry({ entry, activePath, organizationId, repoId, ref }: {
  entry: RepoContentEntry; activePath: string; organizationId: string; repoId: string; ref?: string;
}) {
  const Icon = entry.type === "dir" ? Folder : File;
  return <Link
    className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted ${activePath === entry.path ? "bg-muted font-medium" : ""}`}
    params={{ organizationId, repoId }} search={{ ...(ref ? { ref } : {}), path: entry.path }}
    to="/dashboard/organization/$organizationId/repo/$repoId/code"
  >
    <Icon className={entry.type === "dir" ? "size-4 shrink-0 fill-blue-400/20 text-blue-500" : "size-4 shrink-0 text-muted-foreground"} />
    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
  </Link>;
}

function FileContent({ content, path, rich }: { content: string; path: string; rich: boolean }) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setHighlighted(null);
    void getSharedShikiHighlighter().then((highlighter) => {
      if (!cancelled) setHighlighted(highlighter.codeToHtml(content, { lang: languageForPath(path), theme: "github-dark" }));
    });
    return () => { cancelled = true; };
  }, [content, path]);
  if (rich) return <div className="prose prose-sm dark:prose-invert max-w-none p-5"><MarkdownRenderer content={content} /></div>;
  return highlighted ? <div className="overflow-x-auto p-4 text-xs leading-5 [&_pre]:m-0" dangerouslySetInnerHTML={{ __html: highlighted }} /> : <pre className="overflow-x-auto p-4 text-xs leading-5"><code>{content}</code></pre>;
}

function RouteComponent() {
  const { organizationId, repoId } = Route.useParams();
  const { path, ref } = Route.useSearch();
  const { data: repo } = useGetRepo({ id: repoId });
  const current = useGetRepoContents({ repoId, path, ref });
  const parentPath = current.data?.type === "file" ? path.split("/").slice(0, -1).join("/") : path;
  const explorer = useGetRepoContents({ repoId, path: parentPath, ref });
  const [view, setView] = useState<"source" | "render">("source");
  const repoTitle = repo ? `${repo.owner}/${repo.name}` : repoId;
  const file = current.data?.type === "file" ? current.data.file : null;
  const richAvailable = Boolean(file && isRichFile(file.path));
  const entries = explorer.data?.type === "directory" ? explorer.data.entries : [];
  const baseSearch = ref ? { ref } : {};
  const crumbs = path.split("/").filter(Boolean);

  useEffect(() => { setView("source"); }, [path]);

  return <><PageTitle title={`${repoTitle} · Code`} /><RepoLayout organizationId={organizationId} repoId={repoId}>
    <div className="w-full p-3 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="min-w-0 truncate font-medium">{repoTitle}{crumbs.map((part) => ` / ${part}`).join("")}</div>
        <span className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground"><GitBranch className="size-3.5" />{ref || repo?.defaultBranch || "default branch"}</span>
      </div>
      {current.error ? <Empty className="min-h-80 rounded-lg border"><EmptyHeader><EmptyMedia variant="icon"><TriangleAlert /></EmptyMedia><EmptyTitle>Unable to load repository contents</EmptyTitle><EmptyDescription>{current.error.message}</EmptyDescription></EmptyHeader></Empty> :
        <div className="grid min-h-[calc(100vh-15rem)] overflow-hidden rounded-lg border bg-card lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="border-b bg-muted/20 p-2 lg:border-r lg:border-b-0" aria-label="File explorer">
            <div className="mb-2 flex items-center justify-between px-2 text-xs font-medium text-muted-foreground"><span>Files</span>{parentPath && <Link className="text-primary hover:underline" params={{ organizationId, repoId }} search={{ ...baseSearch, path: parentPath.split("/").slice(0, -1).join("/") }} to="/dashboard/organization/$organizationId/repo/$repoId/code">Up</Link>}</div>
            {explorer.isLoading ? <ContentsSkeleton /> : <div className="space-y-0.5">{entries.map((entry) => <ExplorerEntry activePath={path} entry={entry} key={entry.path} organizationId={organizationId} ref={ref} repoId={repoId} />)}</div>}
          </aside>
          <section className="min-w-0">
            {current.isLoading ? <ContentsSkeleton /> : current.data?.type === "directory" ? <div className="p-3"><h2 className="mb-3 text-sm font-medium">{path || "Repository root"}</h2><div className="grid gap-1">{current.data.entries.map((entry) => <ExplorerEntry activePath={path} entry={entry} key={entry.path} organizationId={organizationId} ref={ref} repoId={repoId} />)}</div></div> : file ? <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5 truncate"><FileCode2 className="size-3.5" />{file.path}</span><div className="flex items-center gap-2"><span>{formatBytes(file.size)}</span>{richAvailable && <span className="flex rounded border p-0.5"><Button onClick={() => setView("source")} size="xs" variant={view === "source" ? "secondary" : "ghost"}>Source</Button><Button onClick={() => setView("render")} size="xs" variant={view === "render" ? "secondary" : "ghost"}>Render</Button></span>}</div></div>
              {file.isBinary || !file.content ? <Empty className="min-h-64"><EmptyHeader><EmptyMedia variant="icon"><File /></EmptyMedia><EmptyTitle>Binary file</EmptyTitle><EmptyDescription>This file cannot be displayed as text.</EmptyDescription></EmptyHeader></Empty> : <FileContent content={file.content} path={file.path} rich={view === "render" && richAvailable} />}
            </> : <Empty className="min-h-64"><EmptyHeader><EmptyTitle>Unsupported repository entry</EmptyTitle></EmptyHeader></Empty>}
          </section>
        </div>}
    </div>
  </RepoLayout></>;
}
function ContentsSkeleton() { return <div className="space-y-2 p-3">{[1, 2, 3, 4, 5].map((item) => <Skeleton className="h-6 w-full" key={item} />)}</div>; }
