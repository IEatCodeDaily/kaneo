import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CircleDot,
  ExternalLink,
  Github,
  GitPullRequest,
  Link2,
  Search,
  Trash2,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
} from "@/components/ui/command";
import { getApiUrl } from "@/fetchers/get-api-url";
import useGetRepoIssues from "@/hooks/queries/repo/use-get-repo-issues";
import useGetRepoPullRequests from "@/hooks/queries/repo/use-get-repo-pull-requests";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";
import useGetTaskRepoLinks from "@/hooks/queries/task/use-get-task-repo-links";
import { toast } from "@/lib/toast";

type ResourceType = "issues" | "pull-requests";

type TaskResourcesProps = {
  taskId: string;
  organizationId: string;
};

type ResourceItem = {
  id: string;
  number: number;
  title: string;
  repoId: string;
  repoLabel: string;
};

type ResourceGroup = {
  value: string;
  label: string;
  items: ResourceItem[];
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
  const [commandOpen, setCommandOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [resourceType, setResourceType] = useState<ResourceType>("issues");
  const queryClient = useQueryClient();
  const { data: links = [] } = useGetTaskRepoLinks(taskId);
  const { data: repos = [] } = useGetRepos({ organizationId });

  // The command palette searches across every connected repo at once, so scope
  // fetches to the first repo only when there is exactly one; otherwise the
  // selected repo comes from the item the user picks.
  const primaryRepoId = repos.length > 0 ? repos[0].id : "";
  const { data: issues } = useGetRepoIssues({
    repoId: primaryRepoId,
    state: "all",
    limit: 100,
  });
  const { data: pullRequests } = useGetRepoPullRequests({
    repoId: primaryRepoId,
    state: "all",
    limit: 100,
  });

  const link = useMutation({
    mutationFn: linkResource,
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not link resource.",
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["task-repo-links", taskId],
      });
      toast.success("GitHub resource linked.");
      setCommandOpen(false);
      setSearchQuery("");
    },
  });

  const unlink = useMutation({
    mutationFn: async (target: {
      repoId: string;
      itemType: ResourceType;
      number: number;
    }) => {
      const response = await fetch(
        getApiUrl(
          `/repo/${target.repoId}/${target.itemType}/${target.number}/task-links/${taskId}`,
        ),
        { credentials: "include", method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error((await response.text()) || "Could not remove link.");
      }
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not remove link.",
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["task-repo-links", taskId],
      });
      toast.success("GitHub resource unlinked.");
    },
  });

  const linkedKeys = useMemo(
    () => new Set(links.map((item) => `${item.itemType}-${item.number}`)),
    [links],
  );

  // One group per repository, matching how Relations groups tasks by board.
  const commandGroups = useMemo<ResourceGroup[]>(() => {
    const source =
      resourceType === "issues" ? issues?.data : pullRequests?.data;
    const repo = repos.find((candidate) => candidate.id === primaryRepoId);
    if (!repo || !source) return [];

    const items = source
      .filter(
        (resource) => !linkedKeys.has(`${resourceType}-${resource.number}`),
      )
      .map((resource) => ({
        id: String(resource.id),
        number: resource.number,
        title: resource.title,
        repoId: repo.id,
        repoLabel: `${repo.owner}/${repo.name}`,
      }));

    return items.length > 0
      ? [
          {
            value: repo.id,
            label: `${repo.owner}/${repo.name}`,
            items,
          },
        ]
      : [];
  }, [issues, linkedKeys, primaryRepoId, pullRequests, repos, resourceType]);

  const handleLink = (item: ResourceItem) => {
    link.mutate({
      itemType: resourceType,
      number: item.number,
      repoId: item.repoId,
      taskId,
    });
  };

  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 px-2">
        <span className="text-xs font-medium text-foreground/70">
          Resources
        </span>
        <Button
          onClick={() => setCommandOpen(true)}
          size="icon-xs"
          variant="ghost"
        >
          <Link2 className="size-3.5" />
          <span className="sr-only">Link GitHub resource</span>
        </Button>
      </div>

      {links.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {links.map((item) => (
            <div
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/60"
              key={item.id}
            >
              {item.itemType === "issues" ? (
                <CircleDot className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <GitPullRequest className="size-4 shrink-0 text-muted-foreground" />
              )}
              <a
                className="flex min-w-0 flex-1 items-center gap-1.5 text-sm hover:text-primary hover:underline"
                href={item.url}
                rel="noreferrer"
                target="_blank"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  #{item.number}
                </span>
                <span className="min-w-0 truncate">{item.title}</span>
                <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
              </a>
              <Button
                aria-label={`Unlink #${item.number}`}
                className="opacity-0 group-hover:opacity-100"
                disabled={unlink.isPending}
                onClick={() =>
                  unlink.mutate({
                    itemType: item.itemType,
                    number: item.number,
                    repoId: item.repoId,
                  })
                }
                size="icon-xs"
                variant="ghost"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <button
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => setCommandOpen(true)}
        type="button"
      >
        <Github className="size-4" />
        <span>Link issue or pull request</span>
      </button>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandDialogPopup>
          <Command items={commandGroups}>
            <CommandInput
              placeholder="Search issues and pull requests..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <CommandPanel>
              <CommandEmpty>
                <div className="text-center py-6">
                  <Search className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {repos.length === 0
                      ? "No repositories are connected to this organization yet."
                      : `No ${resourceType === "issues" ? "issues" : "pull requests"} found.`}
                  </p>
                </div>
              </CommandEmpty>
              <CommandList>
                {(group: ResourceGroup, groupIndex: number) => (
                  <Fragment key={group.value}>
                    <CommandGroup items={group.items}>
                      <CommandGroupLabel>{group.label}</CommandGroupLabel>
                      <CommandCollection>
                        {(item: ResourceItem) => (
                          <CommandItem
                            key={item.id}
                            value={`#${item.number} ${item.title} ${item.repoLabel}`}
                            onClick={() => handleLink(item)}
                            className="flex items-center gap-3 py-2"
                          >
                            {resourceType === "issues" ? (
                              <CircleDot className="size-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <GitPullRequest className="size-4 shrink-0 text-muted-foreground" />
                            )}
                            <span className="text-xs text-muted-foreground shrink-0 font-mono">
                              #{item.number}
                            </span>
                            <span className="text-sm truncate flex-1">
                              {item.title}
                            </span>
                          </CommandItem>
                        )}
                      </CommandCollection>
                    </CommandGroup>
                    {groupIndex < commandGroups.length - 1 && (
                      <CommandSeparator />
                    )}
                  </Fragment>
                )}
              </CommandList>
            </CommandPanel>
            <CommandFooter>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${resourceType === "issues" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setResourceType("issues")}
                >
                  <CircleDot className="size-3" />
                  Issues
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${resourceType === "pull-requests" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setResourceType("pull-requests")}
                >
                  <GitPullRequest className="size-3" />
                  Pull requests
                </button>
              </div>
              <span className="text-muted-foreground/60">Select to link</span>
            </CommandFooter>
          </Command>
        </CommandDialogPopup>
      </CommandDialog>
    </section>
  );
}
