import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CircleDot,
  ExternalLink,
  MessageSquare,
  ArrowLeft,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import OrganizationLayout from "@/components/common/organization-layout";
import PageTitle from "@/components/page-title";
import RepoLabelList from "@/components/repo/repo-label-list";
import RepoStateBadge from "@/components/repo/repo-state-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import useGetRepo from "@/hooks/queries/repo/use-get-repo";
import useGetRepoIssues from "@/hooks/queries/repo/use-get-repo-issues";
import { formatDateMedium } from "@/lib/format";
import type { RepoIssueStateFilter } from "@/types/repo";

const STATE_FILTERS: RepoIssueStateFilter[] = ["open", "closed", "all"];

type IssuesSearchParams = {
  state: RepoIssueStateFilter;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId/repo/$repoId/issues",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): IssuesSearchParams => ({
    state: STATE_FILTERS.includes(search.state as RepoIssueStateFilter)
      ? (search.state as RepoIssueStateFilter)
      : "open",
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const { organizationId, repoId } = Route.useParams();
  const { state } = Route.useSearch();
  const navigate = useNavigate();
  const { data: repo } = useGetRepo({ id: repoId });
  const { data, isLoading } = useGetRepoIssues({ repoId, state });

  const repoTitle = repo ? `${repo.owner}/${repo.name}` : repoId;
  const pageTitle = `${repoTitle} · ${t("organization:repos.issues.pageTitle")}`;

  const headerActions = (
    <Button
      className="gap-1"
      onClick={() =>
        navigate({
          to: "/dashboard/organization/$organizationId/repo",
          params: { organizationId },
        })
      }
      size="xs"
      variant="outline"
    >
      <ArrowLeft className="w-3 h-3" />
      {t("organization:repos.backToRepos")}
    </Button>
  );

  const tabs = (
    <div className="flex items-center justify-between gap-2 px-2 py-2">
      <Tabs value={state}>
        <TabsList className="bg-sidebar gap-2">
          {STATE_FILTERS.map((filter) => (
            <TabsTrigger
              className="[&[data-state=active]]:border [&[data-state=active]]:border-border [&[data-state=active]]:rounded-md [&[data-state=active]]:bg-card"
              key={filter}
              onClick={() =>
                navigate({
                  to: ".",
                  search: { state: filter },
                  replace: true,
                })
              }
              value={filter}
            >
              {t(`organization:repos.stateFilter.${filter}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Tabs value="issues">
        <TabsList className="bg-sidebar gap-2">
          <TabsTrigger
            className="[&[data-state=active]]:border [&[data-state=active]]:border-border [&[data-state=active]]:rounded-md [&[data-state=active]]:bg-card"
            value="issues"
          >
            {t("organization:repos.issues.tab")}
          </TabsTrigger>
          <TabsTrigger
            className="[&[data-state=active]]:border [&[data-state=active]]:border-border [&[data-state=active]]:rounded-md [&[data-state=active]]:bg-card"
            onClick={() =>
              navigate({
                to: "/dashboard/organization/$organizationId/repo/$repoId/pulls",
                params: { organizationId, repoId },
              })
            }
            value="pulls"
          >
            {t("organization:repos.pullRequests.tab")}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );

  return (
    <>
      <PageTitle title={pageTitle} />
      <OrganizationLayout headerActions={headerActions} title={repoTitle}>
        {tabs}

        {isLoading && (
          <div className="flex flex-col divide-y">
            {[1, 2, 3, 4, 5].map((i) => (
              <div className="flex items-start gap-3 px-3 py-3" key={i}>
                <Skeleton className="h-4 w-4 mt-0.5" />
                <div className="flex flex-col gap-2 flex-1">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-5 w-14" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && (!data || data.data.length === 0) && (
          <Empty className="min-h-[50vh]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleDot />
              </EmptyMedia>
              <EmptyTitle>
                {t("organization:repos.issues.emptyTitle")}
              </EmptyTitle>
              <EmptyDescription>
                {t("organization:repos.issues.emptyDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {!isLoading && data && data.data.length > 0 && (
          <div className="flex flex-col divide-y">
            {data.data.map((issue) => (
              <a
                className="flex items-start gap-3 px-3 py-3 transition-colors hover:bg-muted/60"
                href={issue.url}
                key={issue.id}
                rel="noreferrer"
                target="_blank"
              >
                <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{issue.title}</span>
                    <RepoStateBadge state={issue.state} />
                    <RepoLabelList labels={issue.labels} />
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>#{issue.number}</span>
                    {issue.authorLogin && (
                      <span className="flex items-center gap-1.5">
                        <Avatar className="size-4">
                          {issue.authorAvatarUrl && (
                            <AvatarImage src={issue.authorAvatarUrl} />
                          )}
                          <AvatarFallback className="text-[8px]">
                            {issue.authorLogin.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {issue.authorLogin}
                      </span>
                    )}
                    {issue.externalCreatedAt && (
                      <span>{formatDateMedium(issue.externalCreatedAt)}</span>
                    )}
                    {issue.commentCount > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {issue.commentCount}
                      </span>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </OrganizationLayout>
    </>
  );
}
