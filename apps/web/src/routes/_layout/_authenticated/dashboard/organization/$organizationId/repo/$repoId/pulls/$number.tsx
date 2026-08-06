import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ExternalLink,
  GitBranch,
  MessageSquare,
} from "lucide-react";
import RepoLayout from "@/components/common/repo-layout";
import PageTitle from "@/components/page-title";
import RepoDetailManagement from "@/components/repo/repo-detail-management";
import RepoLabelList from "@/components/repo/repo-label-list";
import RepoStateBadge from "@/components/repo/repo-state-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import useGetRepo from "@/hooks/queries/repo/use-get-repo";
import useGetRepoPullRequest from "@/hooks/queries/repo/use-get-repo-pull-request";
import { formatDateMedium } from "@/lib/format";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId/repo/$repoId/pulls/$number",
)({ component: RouteComponent });

function RouteComponent() {
  const navigate = useNavigate();
  const { organizationId, repoId, number: numberParam } = Route.useParams();
  const number = Number(numberParam);
  const { data: repo } = useGetRepo({ id: repoId });
  const {
    data: pullRequest,
    isLoading,
    isError,
  } = useGetRepoPullRequest({ repoId, number });
  const repoTitle = repo ? `${repo.owner}/${repo.name}` : repoId;
  const back = () =>
    navigate({
      to: "/dashboard/organization/$organizationId/repo/$repoId/pulls",
      params: { organizationId, repoId },
    });

  return (
    <>
      <PageTitle
        title={
          pullRequest
            ? `#${pullRequest.number} · ${pullRequest.title}`
            : `${repoTitle} · Pull request`
        }
      />
      <RepoLayout organizationId={organizationId} repoId={repoId}>
        {isLoading ? (
          <DetailSkeleton />
        ) : isError || !pullRequest ? (
          <NotFound onBack={back} />
        ) : (
          <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
            <Button
              className="mb-5 gap-1.5"
              onClick={back}
              size="sm"
              variant="ghost"
            >
              <ArrowLeft className="size-3.5" />
              Back to pull requests
            </Button>
            <article className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
              <header className="border-b border-border/80 px-5 py-5 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                      {pullRequest.title}
                    </h1>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <RepoStateBadge
                        state={
                          pullRequest.isDraft && pullRequest.state === "open"
                            ? "draft"
                            : pullRequest.state
                        }
                      />
                      <span>#{pullRequest.number}</span>
                      {pullRequest.externalCreatedAt && (
                        <span>
                          opened{" "}
                          {formatDateMedium(pullRequest.externalCreatedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <a
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                    href={pullRequest.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open externally
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Author
                    login={pullRequest.authorLogin}
                    avatarUrl={pullRequest.authorAvatarUrl}
                  />
                  <RepoLabelList labels={pullRequest.labels} />
                </div>
                {pullRequest.headBranch && pullRequest.baseBranch && (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-xs">
                    <GitBranch className="size-3.5 text-muted-foreground" />
                    {pullRequest.headBranch}
                    <span className="text-muted-foreground">→</span>
                    {pullRequest.baseBranch}
                  </div>
                )}
              </header>
              <div className="min-h-48 px-5 py-6 sm:px-6">
                {pullRequest.body ? (
                  <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                    {pullRequest.body}
                  </p>
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    No description provided.
                  </p>
                )}
              </div>
              <RepoDetailManagement
                body={pullRequest.body}
                kind="pull-request"
                labels={pullRequest.labels}
                number={pullRequest.number}
                repoId={repoId}
                state={pullRequest.state}
                title={pullRequest.title}
              />
              <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/80 px-5 py-3 text-xs text-muted-foreground sm:px-6">
                {pullRequest.commentCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="size-3.5" />
                    {pullRequest.commentCount} comments
                  </span>
                )}
                {pullRequest.mergedAt ? (
                  <span>Merged {formatDateMedium(pullRequest.mergedAt)}</span>
                ) : pullRequest.closedAt ? (
                  <span>Closed {formatDateMedium(pullRequest.closedAt)}</span>
                ) : null}
              </footer>
            </article>
          </main>
        )}
      </RepoLayout>
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
      <Skeleton className="mb-5 h-8 w-36" />
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
      <h1 className="text-2xl font-semibold">Pull request not found</h1>
      <p className="max-w-md text-muted-foreground">
        This pull request may not exist or is no longer available.
      </p>
      <Button onClick={onBack} variant="outline">
        Back to pull requests
      </Button>
    </main>
  );
}
