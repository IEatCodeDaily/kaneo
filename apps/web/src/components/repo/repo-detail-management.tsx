import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  ChevronDown,
  CircleDot,
  Copy,
  Edit3,
  GitMerge,
  LoaderCircle,
  MessageSquare,
  Milestone,
  Tags,
  Users,
  Workflow,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Textarea } from "@/components/ui/textarea";
import { getApiUrl } from "@/fetchers/get-api-url";
import useGetRepoGithubMetadata from "@/hooks/queries/repo/use-get-repo-github-metadata";
import { toast } from "@/lib/toast";
import type { RepoLabel } from "@/types/repo";

type Kind = "issue" | "pull-request";

type UpdatePayload = {
  title?: string;
  body?: string;
  state?: "open" | "closed";
  labels?: string[];
  assignees?: string[];
  milestone?: number | null;
};

type Props = {
  kind: Kind;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed" | "merged";
  labels: RepoLabel[];
  assignees?: string[];
  milestoneNumber?: number | null;
  github?: {
    subIssues?: Array<{ number: number; title: string; state: string; url: string }>;
    linkedPullRequests?: Array<{ number: number; title: string; state: string; url: string }>;
    subIssuesSupported?: boolean;
  } | null;
  descriptionActionTargetId?: string;
};

// ─── shared internals ────────────────────────────────────────────

function useRepoMutations(
  kind: Kind,
  repoId: string,
  number: number,
) {
  const queryClient = useQueryClient();
  const isIssue = kind === "issue";
  const resourcePath = `/repo/${repoId}/${isIssue ? "issues" : "pull-requests"}/${number}`;
  const queryKey = [isIssue ? "repo-issue" : "repo-pull-request", repoId, number];

  const request = async (path: string, init: RequestInit) => {
    const response = await fetch(getApiUrl(path), {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init.headers },
      ...init,
    });
    if (!response.ok)
      throw new Error((await response.text()) || "GitHub update failed");
  };

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: ["repo", repoId] });
  };

  const update = useMutation({
    mutationFn: (payload: UpdatePayload) =>
      request(resourcePath, { body: JSON.stringify(payload), method: "PATCH" }),
    onSuccess: invalidate,
  });

  return { update, resourcePath, queryKey, invalidate, request };
}

// ─── right sidebar: metadata pickers only ───────────────────────

export function RepoIssueSidebar({
  kind,
  repoId,
  number,
  title,
  labels,
  assignees = [],
  milestoneNumber = null,
  github,
}: Props) {
  const name = kind === "issue" ? "Issue" : "Pull Request";
  const { update } = useRepoMutations(kind, repoId, number);
  const { data: metadata, isLoading: metadataLoading } =
    useGetRepoGithubMetadata({ repoId });

  const selectedLabels = labels.map((l) => l.name);
  const [pendingField, setPendingField] = useState<
    "labels" | "assignees" | "milestone" | null
  >(null);

  const updateMetadata = (
    field: "labels" | "assignees" | "milestone",
    payload: UpdatePayload,
  ) => {
    setPendingField(field);
    update.mutate(payload, {
      onSuccess: () => toast.success("Updated on GitHub."),
      onError: () => toast.error("GitHub could not save this update."),
      onSettled: () => setPendingField(null),
    });
  };

  const toggleLabel = (label: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...selectedLabels, label])]
      : selectedLabels.filter((l) => l !== label);
    updateMetadata("labels", { labels: next });
  };

  const toggleAssignee = (login: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...assignees, login])]
      : assignees.filter((a) => a !== login);
    updateMetadata("assignees", { assignees: next });
  };

  const setMilestone = (value: string) => {
    const n = value === "none" ? null : Number(value);
    updateMetadata("milestone", { milestone: n });
  };

  const emptyMeta = !metadataLoading && metadata;
  const isGithubIssue = kind === "issue";

  return (
    <aside
      className="space-y-4 border-border/80 p-5 sm:p-6 lg:sticky lg:top-4 lg:border-l"
      aria-label={`${name} metadata`}
    >
      {/* Labels */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Labels</p>
        <Menu>
          <MenuTrigger
            render={
              <Button
                className="w-full justify-between"
                disabled={pendingField === "labels"}
                size="sm"
                variant="ghost"
              />
            }
          >
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              {pendingField === "labels" && (
                <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
              )}
              {selectedLabels.length > 0 ? (
                <>
                  {selectedLabels.slice(0, 3).map((ln) => {
                    const lbl = metadata?.labels.find((l) => l.name === ln);
                    return (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                        key={ln}
                        style={
                          lbl
                            ? {
                                backgroundColor: `#${lbl.color}22`,
                                color: `#${lbl.color}`,
                              }
                            : undefined
                        }
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{
                            backgroundColor: lbl ? `#${lbl.color}` : "#999",
                          }}
                        />
                        {ln}
                      </span>
                    );
                  })}
                  {selectedLabels.length > 3 && (
                    <span className="text-xs text-muted-foreground">
                      +{selectedLabels.length - 3}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  None yet
                </span>
              )}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </MenuTrigger>
          <MenuPopup align="end" className="min-w-56">
            <MenuGroup>
              <MenuGroupLabel>Apply labels</MenuGroupLabel>
              {metadataLoading && <MenuItem disabled>Loading labels…</MenuItem>}
              {emptyMeta &&
                metadata.labels.length === 0 && (
                  <MenuItem disabled>No labels in this repository</MenuItem>
                )}
              {metadata?.labels.map((label) => (
                <MenuCheckboxItem
                  checked={selectedLabels.includes(label.name)}
                  key={label.name}
                  onCheckedChange={(checked) =>
                    toggleLabel(label.name, checked)
                  }
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full border"
                      style={{ backgroundColor: `#${label.color}` }}
                    />
                    {label.name}
                  </span>
                </MenuCheckboxItem>
              ))}
            </MenuGroup>
          </MenuPopup>
        </Menu>
      </div>

      {/* Assignees */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Assignees
        </p>
        <Menu>
          <MenuTrigger
            render={
              <Button
                className="w-full justify-between"
                disabled={pendingField === "assignees"}
                size="sm"
                variant="ghost"
              />
            }
          >
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              {pendingField === "assignees" && (
                <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
              )}
              {assignees.length > 0 ? (
                assignees.map((login) => (
                  <span
                    className="flex items-center gap-1 text-xs"
                    key={login}
                  >
                    <Avatar className="size-4">
                      <AvatarFallback className="text-[7px]">
                        {login.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {login}
                  </span>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">
                  No assignees
                </span>
              )}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </MenuTrigger>
          <MenuPopup align="end" className="min-w-56">
            <MenuGroup>
              <MenuGroupLabel>Assign people</MenuGroupLabel>
              {metadataLoading && <MenuItem disabled>Loading people…</MenuItem>}
              {emptyMeta &&
                metadata.assignableUsers.length === 0 && (
                  <MenuItem disabled>No assignable users</MenuItem>
                )}
              {metadata?.assignableUsers.map((user) => (
                <MenuCheckboxItem
                  checked={assignees.includes(user.login)}
                  key={user.login}
                  onCheckedChange={(checked) =>
                    toggleAssignee(user.login, checked)
                  }
                >
                  <span className="flex items-center gap-2">
                    <Avatar className="size-5">
                      <AvatarImage alt={user.login} src={user.avatarUrl} />
                      <AvatarFallback className="text-[8px]">
                        {user.login.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {user.login}
                  </span>
                </MenuCheckboxItem>
              ))}
            </MenuGroup>
          </MenuPopup>
        </Menu>
      </div>

      {/* Milestone */}
      {isGithubIssue && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Milestone
          </p>
          <Menu>
            <MenuTrigger
              render={
                <Button
                  className="w-full justify-between"
                  disabled={pendingField === "milestone"}
                  size="sm"
                  variant="ghost"
                />
              }
            >
              <span className="flex min-w-0 items-center gap-1.5 truncate text-xs">
                {pendingField === "milestone" && (
                  <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
                )}
                {(() => {
                  const ms = metadata?.milestones.find(
                    (m) => m.number === milestoneNumber,
                  );
                  return ms ? (
                    <>
                      <Milestone className="size-3.5" />
                      {ms.title}
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      No milestone
                    </span>
                  );
                })()}
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </MenuTrigger>
            <MenuPopup align="end" className="min-w-56">
              <MenuGroup>
                <MenuGroupLabel>Set milestone</MenuGroupLabel>
                {metadataLoading && (
                  <MenuItem disabled>Loading milestones…</MenuItem>
                )}
              </MenuGroup>
              <MenuRadioGroup
                onValueChange={(value) => setMilestone(String(value))}
                value={milestoneNumber ? String(milestoneNumber) : "none"}
              >
                <MenuRadioItem value="none">No milestone</MenuRadioItem>
                {metadata?.milestones.map((milestone) => (
                  <MenuRadioItem
                    key={milestone.number}
                    value={String(milestone.number)}
                  >
                    {milestone.title}
                    {milestone.state === "closed" && " (closed)"}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuPopup>
          </Menu>
        </div>
      )}

      {/* Development: linked PRs and sub-issues */}
      <div className="border-t border-border/80 pt-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Workflow className="size-3.5" /> Development
        </p>
        {github?.linkedPullRequests && github.linkedPullRequests.length > 0 ? (
          <div className="mb-2 space-y-1">
            {github.linkedPullRequests.map((pr) => (
              <a
                className="flex items-center gap-1.5 text-xs hover:text-primary"
                href={pr.url}
                key={pr.number}
                rel="noreferrer"
                target="_blank"
              >
                <GitMerge className="size-3 text-muted-foreground" />
                <span className="truncate">#{pr.number} {pr.title}</span>
              </a>
            ))}
          </div>
        ) : null}
        {github?.subIssues && github.subIssues.length > 0 ? (
          <div className="space-y-1">
            {github.subIssues.map((sub) => (
              <a
                className="flex items-center gap-1.5 text-xs hover:text-primary"
                href={sub.url}
                key={sub.number}
                rel="noreferrer"
                target="_blank"
              >
                <CircleDot className="size-3 text-muted-foreground" />
                <span className="truncate">#{sub.number} {sub.title}</span>
              </a>
            ))}
          </div>
        ) : null}
        {!github?.linkedPullRequests?.length && !github?.subIssues?.length && (
          <p className="text-xs text-muted-foreground">
            No linked branches or sub-issues yet.
          </p>
        )}
      </div>
    </aside>
  );
}

// ─── main body: edit, close/reopen, merge, comment ───────────────

export function RepoIssueActions({
  kind,
  repoId,
  number,
  title,
  body,
  state,
  descriptionActionTargetId,
}: Props) {
  const name = kind === "issue" ? "Issue" : "Pull Request";
  const { update, resourcePath, queryKey, request } = useRepoMutations(
    kind,
    repoId,
    number,
  );
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftBody, setDraftBody] = useState(body ?? "");
  const [duplicateOf, setDuplicateOf] = useState("");
  const [descriptionActionTarget, setDescriptionActionTarget] =
    useState<HTMLElement | null>(null);

  useEffect(() => {
    setDescriptionActionTarget(
      descriptionActionTargetId
        ? document.getElementById(descriptionActionTargetId)
        : null,
    );
  }, [descriptionActionTargetId]);

  const openEdit = () => {
    setDraftTitle(title);
    setDraftBody(body ?? "");
    setEditOpen(true);
  };

  const saveEdit = async () => {
    try {
      await update.mutateAsync({ title: draftTitle, body: draftBody });
      toast.success(`${name} updated on GitHub.`);
      setEditOpen(false);
    } catch {
      toast.error(`Could not update the ${name.toLowerCase()}.`);
    }
  };

  const showIssueClose = kind === "issue" && state === "open";

  const closeIssueWith = useMutation({
    mutationFn: (reason: "completed" | "not_planned") =>
      request(resourcePath, {
        body: JSON.stringify({ state: "closed", stateReason: reason }),
        method: "PATCH",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [kind === "issue" ? "repo-issue" : "repo-pull-request", repoId, number],
      });
      toast.success("Issue closed on GitHub.");
    },
    onError: () => toast.error("Could not close the issue."),
  });

  const markDuplicate = useMutation({
    mutationFn: (canonical: number) =>
      request(`${resourcePath}/duplicate`, {
        body: JSON.stringify({ duplicateOf: canonical }),
        method: "POST",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["repo-issue", repoId, number],
      });
      toast.success("Issue marked as duplicate.");
      setDuplicateOpen(false);
    },
    onError: () => toast.error("Could not mark as duplicate."),
  });

  const addComment = useMutation({
    mutationFn: () =>
      request(`${resourcePath}/comments`, {
        body: JSON.stringify({ body: comment.trim() }),
        method: "POST",
      }),
    onSuccess: async () => {
      setComment("");
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Comment submitted to GitHub.");
    },
    onError: () => toast.error("Could not submit the comment."),
  });

  const merge = useMutation({
    mutationFn: () => request(`${resourcePath}/merge`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Pull request merged.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not merge.",
      ),
  });

  return (
    <>
      {descriptionActionTarget
        ? createPortal(
            <Button onClick={openEdit} size="sm" variant="ghost">
              <Edit3 className="size-3.5" /> Edit
            </Button>,
            descriptionActionTarget,
          )
        : null}

      {/* Pull request action bar */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/80 px-5 py-3 sm:px-6">

        {kind === "pull-request" && state === "open" && (
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button size="sm" variant="default" />}
            >
              <GitMerge className="size-3.5" /> Merge
            </AlertDialogTrigger>
            <AlertDialogPopup>
              <AlertDialogHeader>
                <AlertDialogTitle>Merge pull request?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will merge the open pull request in GitHub. GitHub still
                  enforces branch protection and required reviews.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose render={<Button variant="outline" />}>
                  Cancel
                </AlertDialogClose>
                <Button
                  disabled={merge.isPending}
                  onClick={() => merge.mutate()}
                >
                  {merge.isPending && (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  )}
                  Merge pull request
                </Button>
              </AlertDialogFooter>
            </AlertDialogPopup>
          </AlertDialog>
        )}
      </div>

      {/* Comment composer */}
      <div className="border-t border-border/80 px-5 py-4 sm:px-6">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <MessageSquare className="size-4" /> Leave a comment
        </div>
        <Textarea
          aria-label="Comment"
          className="mb-2"
          onChange={(event) => setComment(event.target.value)}
          placeholder="Leave a comment on GitHub…"
          rows={4}
          value={comment}
        />
        <div className="flex flex-wrap justify-end gap-2">
          {showIssueClose && (
            <Menu>
              <MenuTrigger render={<Button size="sm" variant="outline" />}>
                <Check className="size-3.5" /> Close issue
                <ChevronDown className="size-3.5" />
              </MenuTrigger>
              <MenuPopup align="end" className="min-w-52">
                <MenuItem
                  disabled={closeIssueWith.isPending}
                  onClick={() => closeIssueWith.mutate("completed")}
                >
                  <Check className="size-3.5" /> Close as completed
                </MenuItem>
                <MenuItem
                  disabled={closeIssueWith.isPending}
                  onClick={() => closeIssueWith.mutate("not_planned")}
                >
                  <Ban className="size-3.5" /> Close as not planned
                </MenuItem>
                <MenuSeparator />
                <MenuItem onClick={() => setDuplicateOpen(true)}>
                  <Copy className="size-3.5" /> Close as duplicate…
                </MenuItem>
              </MenuPopup>
            </Menu>
          )}
          {state !== "merged" && !showIssueClose && (
            <Button
              disabled={update.isPending}
              onClick={async () => {
                try {
                  await update.mutateAsync({
                    state: state === "open" ? "closed" : "open",
                  });
                  toast.success(
                    state === "open" ? "Closed on GitHub." : "Reopened on GitHub.",
                  );
                } catch {
                  toast.error("Could not update the state.");
                }
              }}
              size="sm"
              variant="outline"
            >
              <Check className="size-3.5" />
              {state === "open" ? "Close" : "Reopen"}
            </Button>
          )}
          <Button
            disabled={addComment.isPending || !comment.trim()}
            onClick={() => addComment.mutate()}
            size="sm"
          >
            {addComment.isPending && (
              <LoaderCircle className="size-3.5 animate-spin" />
            )}
            Comment
          </Button>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Edit {name}</DialogTitle>
            <DialogDescription>
              Update the title and description in GitHub. Markdown is supported.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <Input
              aria-label="Title"
              onChange={(event) => setDraftTitle(event.target.value)}
              value={draftTitle}
            />
            <Textarea
              aria-label="Description"
              className="font-mono text-sm"
              onChange={(event) => setDraftBody(event.target.value)}
              rows={12}
              value={draftBody}
            />
          </DialogPanel>
          <DialogFooter>
            <Button onClick={() => setEditOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={update.isPending || !draftTitle.trim()}
              onClick={saveEdit}
            >
              {update.isPending && (
                <LoaderCircle className="size-3.5 animate-spin" />
              )}
              Save changes
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      {/* Duplicate dialog */}
      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Close as duplicate</DialogTitle>
            <DialogDescription>
              Enter the issue number this duplicates. GitHub will link them and
              close this issue.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <Input
              aria-label="Canonical issue number"
              onChange={(event) => setDuplicateOf(event.target.value)}
              placeholder="e.g. 42"
              value={duplicateOf}
            />
          </DialogPanel>
          <DialogFooter>
            <Button onClick={() => setDuplicateOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={
                markDuplicate.isPending ||
                !Number.isInteger(Number(duplicateOf)) ||
                Number(duplicateOf) <= 0
              }
              onClick={() => markDuplicate.mutate(Number(duplicateOf))}
            >
              {markDuplicate.isPending && (
                <LoaderCircle className="size-3.5 animate-spin" />
              )}
              Close as duplicate
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}

// Default export for backwards compat with any other import site
export default RepoIssueSidebar;
