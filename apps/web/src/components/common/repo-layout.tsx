import { Link, useLocation } from "@tanstack/react-router";
import { GitPullRequest, CircleDot } from "lucide-react";
import type { ReactNode } from "react";
import Layout from "@/components/common/layout";
import { Button } from "@/components/ui/button";
import { KbdSequence } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { shortcuts } from "@/constants/shortcuts";
import useGetRepo from "@/hooks/queries/repo/use-get-repo";

type RepoLayoutProps = {
  repoId: string;
  organizationId: string;
  children: ReactNode;
  headerActions?: ReactNode;
};

export default function RepoLayout({
  repoId,
  organizationId,
  children,
  headerActions,
}: RepoLayoutProps) {
  const location = useLocation();
  const { data: repo } = useGetRepo({ id: repoId });
  const repoTitle = repo ? `${repo.owner}/${repo.name}` : repoId;
  const activeView = location.pathname.includes("/pulls") ? "pulls" : "issues";

  return (
    <Layout>
      <Layout.Header className="h-11 border-border/80 px-2">
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarTrigger className="-ml-1 h-7 w-7 cursor-pointer text-foreground/85 hover:text-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="flex items-center gap-2 text-[10px]">
                    Toggle sidebar
                    <KbdSequence
                      keys={[
                        shortcuts.sidebar.prefix,
                        shortcuts.sidebar.toggle,
                      ]}
                    />
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="h-4 w-px shrink-0 bg-border/80" />
            <div className="hidden min-w-0 items-center gap-1 text-xs md:flex">
              <span className="truncate text-foreground/75">{repoTitle}</span>
            </div>

            <div className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-border/80 bg-background p-0.5">
              <Link
                className={`inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors ${activeView === "issues" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
                params={{ organizationId, repoId }}
                to="/dashboard/organization/$organizationId/repo/$repoId/issues"
              >
                <CircleDot className="size-3.5" />
                Issues
              </Link>
              <Link
                className={`inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors ${activeView === "pulls" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
                params={{ organizationId, repoId }}
                to="/dashboard/organization/$organizationId/repo/$repoId/pulls"
              >
                <GitPullRequest className="size-3.5" />
                Pull requests
              </Link>
            </div>
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
