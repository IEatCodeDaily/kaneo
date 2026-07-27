import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, MessageSquare } from "lucide-react";
import PageTitle from "@/components/page-title";
import { MarkdownRenderer } from "@/components/public-board/markdown-renderer";
import { RepoIssueActions, RepoIssueSidebar } from "@/components/repo/repo-detail-management";
import RepoIssueHistory from "@/components/repo/repo-issue-history";
import RepoLabelList from "@/components/repo/repo-label-list";
import RepoStateBadge from "@/components/repo/repo-state-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import useGetRepo from "@/hooks/queries/repo/use-get-repo";
import useGetRepoIssue from "@/hooks/queries/repo/use-get-repo-issue";
import { formatDateMedium } from "@/lib/format";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId/repo/$repoId/issues/$number",
)({ component: RouteComponent });

function RouteComponent() {
  const navigate = useNavigate();
  const { organizationId, repoId, number: numberParam } = Route.useParams();
  const number = Number(numberParam);
  const { data: repo } = useGetRepo({ id: repoId });
  const {
    data: issue,
    isLoading,
    isError,
  } = useGetRepoIssue({ repoId, number });
  const repoTitle = repo ? `${repo.owner}/${repo.name}` : repoId;

  return (
    <>
      <PageTitle
        title={
          issue ? `#${issue.number} · ${issue.title}` : `${repoTitle} · Issue`
        }
      />
      {isLoading ? (
        <DetailSkeleton />
      ) : isError || !issue ? (
        <NotFound
          onBack={() =>
            navigate({
              to: "/dashboard/organization/$organizationId/repo/$repoId/issues",
              params: { organizationId, repoId },
            })
          }
        />
      ) : (
        <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
          <Button
            className="mb-5 gap-1.5 lg:hidden"
            onClick={() =>
              navigate({
                to: "/dashboard/organization/$organizationId/repo/$repoId/issues",
                params: { organizationId, repoId },
              })
            }
            size="sm"
            variant="ghost"
          >
            <ArrowLeft className="size-3.5" />
            Back to issues
          </Button>
          <article className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
            <header className="border-b border-border/80 px-5 py-5 sm:px-6">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {issue.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <RepoStateBadge state={issue.state} />
                <span>#{issue.number}</span>
                {issue.authorLogin && <span>opened by {issue.authorLogin}</span>}
                {issue.externalCreatedAt && (
                  <span>{formatDateMedium(issue.externalCreatedAt)}</span>
                )}
                <a
                  className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  href={issue.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  GitHub <ExternalLink className="size-3" />
                </a>
              </div>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem]">
              {/* Main body column */}
              <div className="min-w-0">
                <div className="min-h-48 px-5 py-6 sm:px-6">
                  {issue.body ? (
                    <MarkdownRenderer content={issue.body} />
                  ) : (
                    <p className="text-sm italic text-muted-foreground">
                      No description provided.
                    </p>
                  )}
                </div>
                <RepoIssueHistory github={issue.github} />
                <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/80 px-5 py-3 text-xs text-muted-foreground sm:px-6">
                  {issue.commentCount > 0 && (
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="size-3.5" />
                      {issue.commentCount} comments
                    </span>
                  )}
                  {issue.closedAt && (
                    <span>Closed {formatDateMedium(issue.closedAt)}</span>
                  )}
                </footer>
                {/* Action bar + comment composer in the main body */}
                <RepoIssueActions
                  assignees={issue.assigneeLogins ?? []}
                  body={issue.body}
                  kind="issue"
                  labels={issue.labels}
                  milestoneNumber={issue.github?.milestone?.number ?? null}
                  number={issue.number}
                  repoId={repoId}
                  state={issue.state}
                  title={issue.title}
                />
              </div>
              {/* Right sidebar: metadata only */}
              <RepoIssueSidebar
                assignees={issue.assigneeLogins ?? []}
                body={issue.body}
                github={issue.github}
                kind="issue"
                labels={issue.labels}
                milestoneNumber={issue.github?.milestone?.number ?? null}
                number={issue.number}
                repoId={repoId}
                state={issue.state}
                title={issue.title}
              />
            </div>
          </article>
        </main>
      )}
    </>
  );
}

function Author({
  login,
  avatarUrl,
}: {
  login: string | null;
  avatarUrl: string | null;
}) {
  if (!login) return null;
  return (
    <span className="flex items-center gap-2 text-sm text-muted-foreground">
      <Avatar className="size-6">
        {avatarUrl && <AvatarImage src={avatarUrl} />}
        <AvatarFallback className="text-[9px]">
          {login.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      {login}
    </span>
  );
}
function DetailSkeleton() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Skeleton className="mb-5 h-8 w-28" />
      <div className="rounded-xl border p-6">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="mt-4 h-5 w-1/3" />
        <Skeleton className="mt-10 h-4 w-full" />
        <Skeleton className="mt-3 h-4 w-5/6" />
      </div>
    </main>
  );
}
function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Issue not found</h1>
      <p className="max-w-md text-muted-foreground">
        This issue may not exist or is no longer available.
      </p>
      <Button onClick={onBack} variant="outline">
        Back to issues
      </Button>
    </main>
  );
}
