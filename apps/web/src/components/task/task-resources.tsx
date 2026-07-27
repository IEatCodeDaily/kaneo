import { useMutation } from "@tanstack/react-query";
import {
  CircleDot,
  Github,
  GitPullRequest,
  Link2,
  LoaderCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getApiUrl } from "@/fetchers/get-api-url";
import useGetRepoIssues from "@/hooks/queries/repo/use-get-repo-issues";
import useGetRepoPullRequests from "@/hooks/queries/repo/use-get-repo-pull-requests";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";
import { toast } from "@/lib/toast";

type ResourceType = "issues" | "pull-requests";

type TaskResourcesProps = {
  taskId: string;
  organizationId: string;
};

async function linkResource({
  repoId,
  itemType,
  number,
  taskId,
}: {
  repoId: string;
  itemType: ResourceType;
  number: number;
  taskId: string;
}) {
  const response = await fetch(
    getApiUrl(`/repo/${repoId}/${itemType}/${number}/task-links`),
    {
      body: JSON.stringify({ taskId }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error((await response.text()) || "Could not link resource.");
  }
}

export default function TaskResources({
  taskId,
  organizationId,
}: TaskResourcesProps) {
  const [open, setOpen] = useState(false);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [resourceType, setResourceType] = useState<ResourceType>("issues");
  const [search, setSearch] = useState("");
  const { data: repos = [], isLoading: reposLoading } = useGetRepos({
    organizationId,
  });
  const selectedRepo = repos.find((repo) => repo.id === selectedRepoId);
  const { data: issues, isLoading: issuesLoading } = useGetRepoIssues({
    repoId: selectedRepoId ?? "",
    state: "all",
    limit: 100,
  });
  const { data: pullRequests, isLoading: pullRequestsLoading } =
    useGetRepoPullRequests({
      repoId: selectedRepoId ?? "",
      state: "all",
      limit: 100,
    });
  const link = useMutation({
    mutationFn: linkResource,
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not link resource.",
      ),
    onSuccess: () => {
      toast.success("GitHub resource linked.");
      setOpen(false);
      setSearch("");
    },
  });

  const resources =
    resourceType === "issues" ? issues?.data : pullRequests?.data;
  const isLoading =
    reposLoading ||
    (selectedRepoId !== null &&
      (resourceType === "issues" ? issuesLoading : pullRequestsLoading));
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredResources = useMemo(
    () =>
      (resources ?? []).filter((resource) =>
        `#${resource.number} ${resource.title}`
          .toLocaleLowerCase()
          .includes(normalizedSearch),
      ),
    [normalizedSearch, resources],
  );

  const reset = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSearch("");
      setSelectedRepoId(null);
    }
  };

  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 px-2">
        <span className="text-xs font-medium text-foreground/70">
          Resources
        </span>
        <Dialog onOpenChange={reset} open={open}>
          <DialogTrigger render={<Button size="icon-xs" variant="ghost" />}>
            <Link2 className="size-3.5" />
            <span className="sr-only">Link GitHub resource</span>
          </DialogTrigger>
          <DialogPopup className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Link GitHub resource</DialogTitle>
              <DialogDescription>
                Choose a repository, then link one of its issues or pull
                requests to this task.
              </DialogDescription>
            </DialogHeader>
            <DialogPanel className="space-y-3">
              <div className="space-y-1.5">
                <label
                  className="text-sm font-medium"
                  htmlFor="task-resource-repo"
                >
                  Repository
                </label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  id="task-resource-repo"
                  onChange={(event) => {
                    setSelectedRepoId(event.target.value || null);
                    setSearch("");
                  }}
                  value={selectedRepoId ?? ""}
                >
                  <option value="">Select a repository…</option>
                  {repos.map((repo) => (
                    <option key={repo.id} value={repo.id}>
                      {repo.owner}/{repo.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedRepo && (
                <>
                  <Tabs
                    onValueChange={(value) =>
                      setResourceType(value as ResourceType)
                    }
                    value={resourceType}
                  >
                    <TabsList>
                      <TabsTrigger value="issues">
                        <CircleDot /> Issues
                      </TabsTrigger>
                      <TabsTrigger value="pull-requests">
                        <GitPullRequest /> Pull requests
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Input
                    aria-label="Search GitHub resources"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={`Search ${resourceType === "issues" ? "issues" : "pull requests"}…`}
                    value={search}
                  />
                  <div className="max-h-72 overflow-y-auto rounded-md border">
                    {isLoading ? (
                      <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                        <LoaderCircle className="size-4 animate-spin" /> Loading
                        resources…
                      </p>
                    ) : filteredResources.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">
                        No{" "}
                        {resourceType === "issues" ? "issues" : "pull requests"}{" "}
                        found in {selectedRepo.owner}/{selectedRepo.name}.
                      </p>
                    ) : (
                      filteredResources.map((resource) => (
                        <button
                          className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-accent disabled:opacity-60"
                          disabled={link.isPending}
                          key={resource.id}
                          onClick={() =>
                            link.mutate({
                              itemType: resourceType,
                              number: resource.number,
                              repoId: selectedRepo.id,
                              taskId,
                            })
                          }
                          type="button"
                        >
                          {resourceType === "issues" ? (
                            <CircleDot className="size-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <GitPullRequest className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="font-mono text-xs text-muted-foreground">
                            #{resource.number}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {resource.title}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
              {!selectedRepo && !reposLoading && repos.length === 0 && (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No repositories are connected to this organization yet.
                </p>
              )}
            </DialogPanel>
            <DialogFooter>
              <Button onClick={() => reset(false)} variant="outline">
                Cancel
              </Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
      </div>
      <button
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Github className="size-4" />
        <span>Link issue or pull request</span>
      </button>
    </section>
  );
}
