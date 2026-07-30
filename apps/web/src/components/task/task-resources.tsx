import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CircleDot,
  ExternalLink,
  GitBranch,
  Github,
  GitMerge,
  GitPullRequest,
  GitPullRequestCreateArrow,
  Link2,
  Search,
  Trash2,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@/components/ui/combobox";
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
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { getApiUrl } from "@/fetchers/get-api-url";
import getRepoIssues from "@/fetchers/repo/get-repo-issues";
import getRepoPullRequests from "@/fetchers/repo/get-repo-pull-requests";
import useExternalLinks from "@/hooks/queries/external-link/use-external-links";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";
import useGetTaskRepoLinks from "@/hooks/queries/task/use-get-task-repo-links";
import { toast } from "@/lib/toast";
import type { ExternalLink as ExternalLinkType } from "@/types/external-link";

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

/**
 * Derives "owner/repo" from a GitHub/Gitea resource URL.
 *
 * Auto-synced links only carry a URL — they are not tied to a Kaneo `repo` row,
 * so there is no id to look the repository up by.
 */
function getRepoLabelFromUrl(url: string) {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    return `${segments[0]}/${segments[1]}`;
  } catch {
    return null;
  }
}

/**
 * Repository name shown beside each resource.
 *
 * Truncation is done with CSS rather than by slicing the string so the full
 * "owner/repo" stays available in the native tooltip, and so a long name can
 * never push the title or row actions out of the row.
 */
function RepoLabel({ label }: { label: string }) {
  return (
    <span
      className="max-w-[38%] shrink-0 truncate text-xs text-muted-foreground"
      title={label}
    >
      {label}
    </span>
  );
}

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

async function createSyncedIssue({
  repoId,
  taskId,
}: {
  repoId: string;
  taskId: string;
}) {
  const response = await fetch(getApiUrl(`/repo/${repoId}/synced-issues`), {
    body: JSON.stringify({ taskId }),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      (await response.text()) || "Could not create the GitHub issue.",
    );
  }

  return (await response.json()) as { number: number; htmlUrl: string };
}

export default function TaskResources({
  taskId,
  organizationId,
}: TaskResourcesProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createRepoId, setCreateRepoId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [resourceType, setResourceType] = useState<ResourceType>("issues");
  const queryClient = useQueryClient();
  const { data: links = [] } = useGetTaskRepoLinks(taskId);
  const { data: externalLinks = [] } = useExternalLinks(taskId);
  const { data: repos = [] } = useGetRepos({ organizationId });

  // A task can follow at most one GitHub issue (enforced by the API), so the
  // create action is only offered while none exists.
  const syncedIssue = (externalLinks as ExternalLinkType[]).find(
    (link) => link.resourceType === "issue",
  );

  // The command palette searches across every connected repo at once, so it
  // must fetch from all of them. Scoping to `repos[0]` made the picker show
  // "No issues found" whenever the first repository happened to have none,
  // even though other repos in the organization did.
  const RESOURCE_LIMIT = 100;
  const repoIds = useMemo(() => repos.map((repo) => repo.id), [repos]);

  const issueQueries = useQueries({
    queries: repoIds.map((repoId) => ({
      queryFn: () =>
        getRepoIssues({
          repoId,
          state: "all" as const,
          page: 1,
          limit: RESOURCE_LIMIT,
        }),
      queryKey: ["repo-issues", repoId, "all", 1, RESOURCE_LIMIT],
      enabled: commandOpen,
    })),
  });

  const pullRequestQueries = useQueries({
    queries: repoIds.map((repoId) => ({
      queryFn: () =>
        getRepoPullRequests({
          repoId,
          state: "all" as const,
          page: 1,
          limit: RESOURCE_LIMIT,
        }),
      queryKey: ["repo-pull-requests", repoId, "all", 1, RESOURCE_LIMIT],
      enabled: commandOpen,
    })),
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

  const createIssue = useMutation({
    mutationFn: createSyncedIssue,
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not create the GitHub issue.",
      ),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["task-repo-links", taskId],
        }),
        // The create button keys off external links, so they must refresh too
        // or the action would linger after the issue exists.
        queryClient.invalidateQueries({
          queryKey: ["external-links", taskId],
        }),
      ]);
      setCreateOpen(false);
      setCreateRepoId("");
      toast.success(`Created and synced GitHub issue #${result.number}.`);
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

  // Keyed by repo as well as number: issue #13 in one repository has nothing to
  // do with issue #13 in another, so an existing link must not hide it there.
  const linkedKeys = useMemo(
    () =>
      new Set(
        links.map((item) => `${item.repoId}-${item.itemType}-${item.number}`),
      ),
    [links],
  );

  /**
   * Auto-synced links (board↔GitHub/Gitea integration, webhooks) live in a
   * different table than manually linked repo items, but users think of them as
   * one list, so they render under a single "Resources" header.
   *
   * Only manual links can be unlinked here — an auto-synced link would just be
   * recreated by the next sync, so offering the action would be a lie.
   */
  const autoLinks = useMemo(() => {
    const manualUrls = new Set(links.map((item) => item.url));

    // A branch link is noise once its pull request is present.
    const hasPullRequest =
      links.some((item) => item.itemType === "pull-requests") ||
      (externalLinks as ExternalLinkType[]).some(
        (link) => link.resourceType === "pull_request",
      );

    return (externalLinks as ExternalLinkType[]).filter((link) => {
      // The canonical synchronized issue is task metadata and renders in
      // Properties. Resources remains for manually linked items and secondary
      // integration artifacts such as pull requests and branches.
      if (link.resourceType === "issue") return false;
      if (manualUrls.has(link.url)) return false;
      if (hasPullRequest && link.resourceType === "branch") return false;
      return true;
    });
  }, [externalLinks, links]);

  const hasAnyResource = links.length > 0 || autoLinks.length > 0;

  /** repoId -> "owner/name", so manual links can show their repository. */
  const repoLabelById = useMemo(
    () => new Map(repos.map((repo) => [repo.id, `${repo.owner}/${repo.name}`])),
    [repos],
  );

  // One group per repository, matching how Relations groups tasks by board.
  // Repos with no matching items are omitted so the palette does not show
  // empty headers.
  const commandGroups = useMemo<ResourceGroup[]>(() => {
    const sources =
      resourceType === "issues" ? issueQueries : pullRequestQueries;

    return repos.flatMap((repo, index) => {
      const source = sources[index]?.data?.data;
      if (!source) return [];

      const repoLabel = `${repo.owner}/${repo.name}`;
      const items = source
        .filter(
          (resource) =>
            !linkedKeys.has(`${repo.id}-${resourceType}-${resource.number}`),
        )
        .map((resource) => ({
          id: `${repo.id}-${resource.number}`,
          number: resource.number,
          title: resource.title,
          repoId: repo.id,
          repoLabel,
        }));

      return items.length > 0
        ? [{ value: repo.id, label: repoLabel, items }]
        : [];
    });
  }, [issueQueries, linkedKeys, pullRequestQueries, repos, resourceType]);

  const isLoadingResources = (
    resourceType === "issues" ? issueQueries : pullRequestQueries
  ).some((query) => query.isLoading);

  const handleLink = (item: ResourceItem) => {
    link.mutate({
      itemType: resourceType,
      number: item.number,
      repoId: item.repoId,
      taskId,
    });
  };

  return (
    <section className="flex flex-col gap-1" data-slot="task-resources">
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

      {hasAnyResource && (
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
              {/*
                A repo link points at a repository Kaneo itself renders, so it
                navigates in-app. Board-level GitHub links (rendered elsewhere)
                have no Kaneo page and open on GitHub instead.
              */}
              <Link
                className="flex min-w-0 flex-1 items-center gap-1.5 text-sm hover:text-primary hover:underline"
                params={{
                  organizationId,
                  repoId: item.repoId,
                  number: String(item.number),
                }}
                to={
                  item.itemType === "issues"
                    ? "/dashboard/organization/$organizationId/repo/$repoId/issues/$number"
                    : "/dashboard/organization/$organizationId/repo/$repoId/pulls/$number"
                }
              >
                <span className="font-mono text-xs text-muted-foreground">
                  #{item.number}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {repoLabelById.has(item.repoId) && (
                  <RepoLabel label={repoLabelById.get(item.repoId) as string} />
                )}
              </Link>
              {/* Button composes via `render`, not `asChild`. */}
              <Button
                aria-label={`Open #${item.number} on GitHub`}
                className="opacity-0 group-hover:opacity-100"
                render={
                  <a href={item.url} rel="noreferrer" target="_blank">
                    <ExternalLink className="size-3.5" />
                  </a>
                }
                size="icon-xs"
                variant="ghost"
              />
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

          {autoLinks.map((link) => {
            const isMerged = link.metadata?.merged === true;
            const isPullRequest = link.resourceType === "pull_request";
            const isBranch = link.resourceType === "branch";
            const repoLabel = getRepoLabelFromUrl(link.url);

            return (
              <a
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60"
                href={link.url}
                key={link.id}
                rel="noreferrer"
                target="_blank"
              >
                {/*
                  Auto-synced rows carry a small Link2 badge over the resource
                  icon so they are distinguishable from manually linked items,
                  which are the only ones that can be unlinked here.
                */}
                <span
                  className="relative flex size-4 shrink-0 items-center justify-center"
                  title="Linked automatically by the repository integration"
                >
                  {isBranch ? (
                    <GitBranch className="size-4 text-muted-foreground" />
                  ) : isMerged ? (
                    <GitMerge className="size-4 text-info-foreground" />
                  ) : isPullRequest ? (
                    <GitPullRequest className="size-4 text-muted-foreground" />
                  ) : (
                    <CircleDot className="size-4 text-muted-foreground" />
                  )}
                  <Link2
                    aria-hidden
                    className="absolute -bottom-1 -right-1 size-2.5 rounded-full bg-background text-muted-foreground"
                  />
                  <span className="sr-only">Linked automatically</span>
                </span>
                {!isBranch && (
                  <span className="font-mono text-xs text-muted-foreground">
                    #{link.externalId}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">
                  {link.title || link.externalId}
                </span>
                {repoLabel && <RepoLabel label={repoLabel} />}
                <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </a>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <button
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => setCommandOpen(true)}
          type="button"
        >
          <Github className="size-4" />
          <span>Link issue or pull request</span>
        </button>
        {/*
          Creating a synced issue is the inverse of linking an existing one, so
          it sits beside the link action. Hidden once the task already follows
          an issue: the API allows only one synced issue per task, so offering
          it again could only ever produce a 409.
        */}
        {!syncedIssue && repos.length > 0 && (
          <button
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setCreateOpen(true)}
            type="button"
          >
            <GitPullRequestCreateArrow className="size-4" />
            <span>Create synced issue in repo</span>
          </button>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Create synced issue in repo</DialogTitle>
            <DialogDescription>
              Opens a new GitHub issue seeded from this task's title and
              description. Afterwards GitHub is authoritative — its updates
              overwrite the task's title and description.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-2 text-sm">
              <label htmlFor="create-synced-issue-repository">Repository</label>
              <Combobox
                autoHighlight
                itemToStringLabel={(repo) => `${repo.owner}/${repo.name}`}
                items={repos}
                onValueChange={(repo) => setCreateRepoId(repo?.id ?? "")}
                value={repos.find((repo) => repo.id === createRepoId) ?? null}
              >
                <ComboboxInput
                  aria-label="Repository for the new issue"
                  id="create-synced-issue-repository"
                  placeholder="Search repositories…"
                />
                <ComboboxPopup>
                  <ComboboxEmpty>No repositories found.</ComboboxEmpty>
                  <ComboboxList>
                    <ComboboxCollection>
                      {(repo) => (
                        <ComboboxItem key={repo.id} value={repo}>
                          {repo.owner}/{repo.name}
                        </ComboboxItem>
                      )}
                    </ComboboxCollection>
                  </ComboboxList>
                </ComboboxPopup>
              </Combobox>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button onClick={() => setCreateOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={!createRepoId || createIssue.isPending}
              onClick={() =>
                createIssue.mutate({ repoId: createRepoId, taskId })
              }
            >
              {createIssue.isPending ? "Creating…" : "Create issue"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

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
                      : isLoadingResources
                        ? "Loading…"
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
