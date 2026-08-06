import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { Eye } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/repos",
)({ component: RepoSettings });

function RepoSettings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: organization } = useActiveOrganization();
  const { data: repos = [] } = useGetRepos({
    organizationId: organization?.id ?? "",
  });
  const selectedRepoId =
    location.pathname.match(/^\/dashboard\/settings\/repos\/([^/]+)/)?.[1] ??
    "";
  const selectedRepo = repos.find((repo) => repo.id === selectedRepoId);

  useEffect(() => {
    if (
      (location.pathname === "/dashboard/settings/repos" ||
        location.pathname === "/dashboard/settings/repos/") &&
      repos[0]
    ) {
      void navigate({
        to: "/dashboard/settings/repos/$repoId/visibility",
        params: { repoId: repos[0].id },
        replace: true,
      });
    }
  }, [location.pathname, navigate, repos]);

  return (
    <div className="flex h-full gap-6">
      <aside className="w-64 flex-shrink-0 p-2">
        <p className="mb-2 px-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          Repository
        </p>
        <Select
          value={selectedRepoId}
          onValueChange={(repoId) =>
            void navigate({
              to: "/dashboard/settings/repos/$repoId/visibility",
              params: { repoId },
            })
          }
        >
          <SelectTrigger className="w-full">
            <span className="truncate">
              {selectedRepo
                ? `${selectedRepo.owner}/${selectedRepo.name}`
                : "Select repository"}
            </span>
          </SelectTrigger>
          <SelectContent>
            {repos.map((repo) => (
              <SelectItem key={repo.id} value={repo.id}>
                {repo.owner}/{repo.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          disabled={!selectedRepo}
          className="mt-4 w-full justify-start gap-2 bg-sidebar-accent"
        >
          <Eye className="size-4" /> Visibility
        </Button>
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
