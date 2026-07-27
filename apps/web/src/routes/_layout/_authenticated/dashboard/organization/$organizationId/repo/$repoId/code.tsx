import { Link, createFileRoute } from "@tanstack/react-router";
import { File, FileCode2, Folder, GitBranch, TriangleAlert } from "lucide-react";
import PageTitle from "@/components/page-title";
import RepoLayout from "@/components/common/repo-layout";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import useGetRepo from "@/hooks/queries/repo/use-get-repo";
import useGetRepoContents from "@/hooks/queries/repo/use-get-repo-contents";
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

function fileIcon(entry: RepoContentEntry) {
  return entry.type === "dir" ? (
    <Folder className="size-4 shrink-0 fill-blue-400/20 text-blue-500" />
  ) : (
    <File className="size-4 shrink-0 text-muted-foreground" />
  );
}

function RouteComponent() {
  const { organizationId, repoId } = Route.useParams();
  const { path, ref } = Route.useSearch();
  const { data: repo } = useGetRepo({ id: repoId });
  const { data, error, isLoading } = useGetRepoContents({ repoId, path, ref });
  const repoTitle = repo ? `${repo.owner}/${repo.name}` : repoId;
  const parts = path ? path.split("/").filter(Boolean) : [];
  const baseSearch = ref ? { ref } : {};
  const renderCrumb = (part: string, index: number) => {
    const segmentPath = parts.slice(0, index + 1).join("/");
    const isLast = index === parts.length - 1;
    return (
      <span className="flex min-w-0 items-center gap-1" key={segmentPath}>
        <span className="text-muted-foreground">/</span>
        {isLast ? (
          <span className="truncate font-medium">{part}</span>
        ) : (
          <Link
            className="truncate text-primary hover:underline"
            params={{ organizationId, repoId }}
            search={{ ...baseSearch, path: segmentPath }}
            to="/dashboard/organization/$organizationId/repo/$repoId/code"
          >
            {part}
          </Link>
        )}
      </span>
    );
  };

  return (
    <>
      <PageTitle title={`${repoTitle} · Code`} />
      <RepoLayout organizationId={organizationId} repoId={repoId}>
        <div className="mx-auto w-full max-w-6xl p-3 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1 text-sm">
              <Link
                className="font-medium text-primary hover:underline"
                params={{ organizationId, repoId }}
                search={baseSearch}
                to="/dashboard/organization/$organizationId/repo/$repoId/code"
              >
                {repoTitle}
              </Link>
              {parts.map((part, index) => renderCrumb(part, index))}
            </div>
            <span className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
              <GitBranch className="size-3.5" />
              {ref || repo?.defaultBranch || "default branch"}
            </span>
          </div>

          {isLoading && <ContentsSkeleton />}
          {error && (
            <Empty className="min-h-80 rounded-lg border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><TriangleAlert /></EmptyMedia>
                <EmptyTitle>Unable to load repository contents</EmptyTitle>
                <EmptyDescription>{error.message}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {data?.type === "directory" && (
            <div className="overflow-hidden rounded-lg border bg-card">
              <div className="divide-y">
                {path && (
                  <Link
                    className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/60"
                    params={{ organizationId, repoId }}
                    search={{ ...baseSearch, path: parts.slice(0, -1).join("/") }}
                    to="/dashboard/organization/$organizationId/repo/$repoId/code"
                  >
                    <Folder className="size-4 text-muted-foreground" />
                    <span>..</span>
                  </Link>
                )}
                {data.entries.map((entry) => (
                  <Link
                    className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/60"
                    key={entry.path}
                    params={{ organizationId, repoId }}
                    search={{ ...baseSearch, path: entry.path }}
                    to="/dashboard/organization/$organizationId/repo/$repoId/code"
                  >
                    {fileIcon(entry)}
                    <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
                    {entry.type !== "dir" && <span className="text-xs text-muted-foreground">{formatBytes(entry.size)}</span>}
                  </Link>
                ))}
                {data.entries.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">This directory is empty.</p>}
              </div>
            </div>
          )}
          {data?.type === "file" && data.file && (
            <div className="overflow-hidden rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><FileCode2 className="size-3.5" />{data.file.path}</span>
                <span>{formatBytes(data.file.size)}</span>
              </div>
              {data.file.isBinary ? (
                <Empty className="min-h-64"><EmptyHeader><EmptyMedia variant="icon"><File /></EmptyMedia><EmptyTitle>Binary file</EmptyTitle><EmptyDescription>This file cannot be displayed as text.</EmptyDescription></EmptyHeader></Empty>
              ) : (
                <pre className="overflow-x-auto p-4 text-xs leading-5"><code>{data.file.content}</code></pre>
              )}
            </div>
          )}
          {data && data.type !== "directory" && data.type !== "file" && (
            <Empty className="min-h-64 rounded-lg border"><EmptyHeader><EmptyMedia variant="icon"><File /></EmptyMedia><EmptyTitle>Unsupported repository entry</EmptyTitle><EmptyDescription>This {data.type} cannot be displayed.</EmptyDescription></EmptyHeader></Empty>
          )}
        </div>
      </RepoLayout>
    </>
  );
}

function ContentsSkeleton() {
  return <div className="overflow-hidden rounded-lg border"><div className="divide-y">{[1, 2, 3, 4, 5].map((item) => <div className="flex gap-3 px-3 py-3" key={item}><Skeleton className="size-4" /><Skeleton className="h-4 w-1/3" /></div>)}</div></div>;
}
