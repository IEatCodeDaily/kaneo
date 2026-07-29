import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CircleDot, Github, GitPullRequest, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import OrganizationLayout from "@/components/common/organization-layout";
import PageTitle from "@/components/page-title";
import { AddRepoDialog } from "@/components/repo/add-repo-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";
import { formatDateMedium } from "@/lib/format";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId/repo/",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const [addOpen, setAddOpen] = useState(false);
  const { organizationId } = Route.useParams();
  const navigate = useNavigate();
  const { data: repos, isLoading } = useGetRepos({ organizationId });
  const headerActions = (
    <Button variant="outline" size="xs" onClick={() => setAddOpen(true)}>
      <Plus className="size-3" />
      {t("organization:repos.add.button")}
    </Button>
  );

  const handleRepoClick = (repoId: string) => {
    navigate({
      to: "/dashboard/organization/$organizationId/repo/$repoId/issues",
      params: { organizationId, repoId },
    });
  };

  if (isLoading) {
    return (
      <>
        <PageTitle title={t("organization:repos.pageTitle")} />
        <OrganizationLayout
          title={t("organization:repos.pageTitle")}
          headerActions={headerActions}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-foreground font-medium">
                  {t("organization:repos.table.name")}
                </TableHead>
                <TableHead className="text-foreground font-medium">
                  {t("organization:repos.table.provider")}
                </TableHead>
                <TableHead className="text-foreground font-medium">
                  {t("organization:repos.table.openIssues")}
                </TableHead>
                <TableHead className="text-foreground font-medium">
                  {t("organization:repos.table.openPullRequests")}
                </TableHead>
                <TableHead className="text-foreground font-medium">
                  {t("organization:repos.table.lastSynced")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-5 w-5" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell className="py-3">
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                  <TableCell className="py-3">
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                  <TableCell className="py-3">
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </OrganizationLayout>
      </>
    );
  }

  if (!repos || repos.length === 0) {
    return (
      <>
        <PageTitle title={t("organization:repos.pageTitle")} />
        <OrganizationLayout
          title={t("organization:repos.pageTitle")}
          headerActions={headerActions}
        >
          <Empty className="min-h-[60vh]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Github />
              </EmptyMedia>
              <EmptyTitle>{t("organization:repos.emptyTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("organization:repos.emptyDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
          <AddRepoDialog
            onOpenChange={setAddOpen}
            open={addOpen}
            organizationId={organizationId}
          />
        </OrganizationLayout>
      </>
    );
  }

  return (
    <>
      <PageTitle title={t("organization:repos.pageTitle")} />
      <OrganizationLayout
        title={t("organization:repos.pageTitle")}
        headerActions={headerActions}
      >
        <Table>
          <TableHeader className="p-4">
            <TableRow>
              <TableHead className="text-foreground font-medium">
                {t("organization:repos.table.name")}
              </TableHead>
              <TableHead className="text-foreground font-medium">
                {t("organization:repos.table.provider")}
              </TableHead>
              <TableHead className="text-foreground font-medium">
                {t("organization:repos.table.openIssues")}
              </TableHead>
              <TableHead className="text-foreground font-medium">
                {t("organization:repos.table.openPullRequests")}
              </TableHead>
              <TableHead className="text-foreground font-medium">
                {t("organization:repos.table.lastSynced")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {repos.map((repo) => (
              <TableRow
                className="cursor-pointer"
                key={repo.id}
                onClick={() => handleRepoClick(repo.id)}
              >
                <TableCell className="py-3">
                  <div className="flex items-center gap-3">
                    <Github className="w-4 h-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {repo.owner}/{repo.name}
                      </span>
                      {repo.description && (
                        <span className="text-xs text-muted-foreground truncate max-w-md">
                          {repo.description}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3">
                  <span className="text-sm text-muted-foreground capitalize">
                    {repo.provider}
                  </span>
                </TableCell>
                <TableCell className="py-3">
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CircleDot className="w-3.5 h-3.5" />
                    {repo.openIssueCount}
                  </span>
                </TableCell>
                <TableCell className="py-3">
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <GitPullRequest className="w-3.5 h-3.5" />
                    {repo.openPullRequestCount}
                  </span>
                </TableCell>
                <TableCell className="py-3">
                  <span className="text-sm text-muted-foreground">
                    {repo.lastSyncedAt
                      ? formatDateMedium(repo.lastSyncedAt)
                      : t("organization:repos.neverSynced")}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <AddRepoDialog
          onOpenChange={setAddOpen}
          open={addOpen}
          organizationId={organizationId}
        />
      </OrganizationLayout>
    </>
  );
}
