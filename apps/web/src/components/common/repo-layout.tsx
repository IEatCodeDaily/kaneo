import { Link, useLocation } from "@tanstack/react-router";
import {
  CircleDot,
  Code2,
  GitPullRequest,
  Package,
  Rocket,
} from "lucide-react";
import type { ReactNode } from "react";
import Layout from "@/components/common/layout";
import useGetRepo from "@/hooks/queries/repo/use-get-repo";

type RepoLayoutProps = {
  repoId: string;
  organizationId: string;
  children: ReactNode;
  headerActions?: ReactNode;
};

const VIEWS = [
  {
    label: "Code",
    icon: Code2,
    key: "code" as const,
    to: "/dashboard/organization/$organizationId/repo/$repoId/code" as const,
  },
  {
    label: "Issues",
    icon: CircleDot,
    key: "issues" as const,
    to: "/dashboard/organization/$organizationId/repo/$repoId/issues" as const,
  },
  {
    label: "Pull requests",
    icon: GitPullRequest,
    key: "pulls" as const,
    to: "/dashboard/organization/$organizationId/repo/$repoId/pulls" as const,
  },
  {
    label: "Releases",
    icon: Rocket,
    key: "releases" as const,
    to: "/dashboard/organization/$organizationId/repo/$repoId/releases" as const,
  },
  {
    label: "Packages",
    icon: Package,
    key: "packages" as const,
    to: "/dashboard/organization/$organizationId/repo/$repoId/packages" as const,
  },
];

export default function RepoLayout({
  repoId,
  organizationId,
  children,
  headerActions,
}: RepoLayoutProps) {
  const location = useLocation();
  const { data: repo } = useGetRepo({ id: repoId });
  const repoTitle = repo ? `${repo.owner}/${repo.name}` : repoId;
  const activeView =
    VIEWS.find((view) => location.pathname.includes(`/${view.key}`))?.key ??
    "issues";

  return (
    <Layout>
      <Layout.Header className="h-11 border-border/80 px-2">
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="h-4 w-px shrink-0 bg-border/80" />
            <div className="hidden min-w-0 items-center gap-1 text-xs md:flex">
              <span className="truncate text-foreground/75">{repoTitle}</span>
            </div>

            <nav
              aria-label="Repository views"
              className="inline-flex h-8 min-w-0 items-center gap-0.5 overflow-hidden rounded-lg border border-border/80 bg-background p-0.5"
            >
              {VIEWS.map((view) => {
                const Icon = view.icon;
                const isActive = activeView === view.key;
                return (
                  <Link
                    className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium transition-colors sm:px-2 ${isActive ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
                    key={view.key}
                    params={{ organizationId, repoId }}
                    to={view.to}
                  >
                    <Icon className="size-3.5" />
                    {/* Constrained widths collapse the tabs to icons only. */}
                    <span className="hidden 2xl:inline">{view.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {headerActions}
          </div>
        </div>
      </Layout.Header>
      <Layout.Content>{children}</Layout.Content>
    </Layout>
  );
}
