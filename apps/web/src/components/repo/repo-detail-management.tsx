import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  ChevronDown,
  Copy,
  Edit3,
  GitMerge,
  LoaderCircle,
  MessageSquare,
  Milestone,
  Tags,
  Users,
} from "lucide-react";
import { useState } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Menu,
  MenuCheckboxItem,
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

type RepoDetailManagementProps = {
  kind: "issue" | "pull-request";
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed" | "merged";
  labels: RepoLabel[];
  assignees?: string[];
  milestoneNumber?: number | null;
};

type UpdatePayload = {
  title?: string;
  body?: string;
  state?: "open" | "closed";
  labels?: string[];
  assignees?: string[];
  milestone?: number | null;
};

export default function RepoDetailManagement({
  kind,
  repoId,
  number,
  title,
  body,
  state,
  labels,
  assignees = [],
  milestoneNumber = null,
}: RepoDetailManagementProps) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [comment, setComment] = useState("");

  // Drafts are seeded when a dialog opens, never from a render-time effect:
  // the detail query polls every 15s and new labels/assignees array identities
  // used to reset these mid-edit, silently discarding what the user typed.
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftBody, setDraftBody] = useState(body ?? "");
  const [duplicateOf, setDuplicateOf] = useState("");

  const isGithubIssue = kind === "issue";
  const resourcePath = `/repo/${repoId}/${isGithubIssue ? "issues" : "pull-requests"}/${number}`;
  const queryKey = [
    isGithubIssue ? "repo-issue" : "repo-pull-request",
    repoId,
    number,
  ];

  const { data: metadata, isLoading: metadataLoading } =
    useGetRepoGithubMetadata({ repoId });
  const selectedLabels = labels.map((label) => label.name);

  const openEdit = () => {
    setDraftTitle(title);
    setDraftBody(body ?? "");
    setEditOpen(true);
  };

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
      await invalidate();
      toast.success("Pull request merged.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not merge the pull request.",
      ),
  });

  const closeIssueWith = useMutation({
    mutationFn: (reason: "completed" | "not_planned") =>
      request(`${resourcePath}/close`, {
        body: JSON.stringify({ reason }),
        method: "POST",
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Closed on GitHub.");
    },
    onError: () => toast.error("Could not close the issue."),
  });

  const markDuplicate = useMutation({
    mutationFn: (canonicalNumber: number) =>
      request(`${resourcePath}/duplicate`, {
        body: JSON.stringify({ canonicalNumber }),
        method: "POST",
      }),
    onSuccess: async () => {
      setDuplicateOpen(false);
      setDuplicateOf("");
      await invalidate();
      toast.success("Closed as duplicate on GitHub.");
    },
    onError: () => toast.error("Could not mark as duplicate."),
  });

  const saveEdit = async () => {
    if (!draftTitle.trim()) return;
    try {
      await update.mutateAsync({ body: draftBody, title: draftTitle.trim() });
      setEditOpen(false);
      toast.success("Changes saved to GitHub.");
    } catch {
      toast.error("Could not save changes.");
    }
  };

  const toggleLabel = async (label: string, checked: boolean) => {
    const next = checked
      ? [...selectedLabels, label]
      : selectedLabels.filter((item) => item !== label);
    try {
      await update.mutateAsync({ labels: next });
    } catch {
      toast.error("Could not update labels.");
    }
  };

  const toggleAssignee = async (login: string, checked: boolean) => {
    const next = checked
      ? [...assignees, login]
      : assignees.filter((item) => item !== login);
    try {
      await update.mutateAsync({ assignees: next });
    } catch {
      toast.error("Could not update assignees.");
    }
  };

  const setMilestone = async (value: string) => {
    try {
      await update.mutateAsync({
        milestone: value === "none" ? null : Number(value),
      });
      toast.success("Milestone updated.");
    } catch {
      toast.error("Could not update the milestone.");
    }
  };

  const name = isGithubIssue ? "issue" : "pull request";
  const showIssueClose = isGithubIssue && state === "open";
  const emptyMeta = !metadataLoading && metadata;

  return (
    <section
      className="space-y-4 border-t border-border/80 px-5 py-5 sm:px-6"
      aria-label={`${name} management`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-sm">Manage {name}</h2>
          <p className="text-muted-foreground text-xs">
            Changes are sent directly to GitHub.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={openEdit} size="sm" variant="outline">
            <Edit3 className="size-3.5" /> Edit
          </Button>

          <Menu>
            <MenuTrigger render={<Button size="sm" variant="outline" />}>
              <Tags className="size-3.5" /> Labels <ChevronDown className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="end" className="min-w-56">
              <MenuGroupLabel>Apply labels</MenuGroupLabel>
              {metadataLoading && <MenuItem disabled>Loading labels…</MenuItem>}
              {emptyMeta && metadata.labels.length === 0 && (
                <MenuItem disabled>No labels in this repository</MenuItem>
              )}
              {metadata?.labels.map((label) => (
                <MenuCheckboxItem
                  checked={selectedLabels.includes(label.name)}
                  key={label.name}
                  onCheckedChange={(checked) => toggleLabel(label.name, checked)}
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
            </MenuPopup>
          </Menu>

          <Menu>
            <MenuTrigger render={<Button size="sm" variant="outline" />}>
              <Users className="size-3.5" /> Assignees{" "}
              <ChevronDown className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="end" className="min-w-56">
              <MenuGroupLabel>Assign people</MenuGroupLabel>
              {metadataLoading && <MenuItem disabled>Loading people…</MenuItem>}
              {emptyMeta && metadata.assignableUsers.length === 0 && (
                <MenuItem disabled>No assignable users</MenuItem>
              )}
              {metadata?.assignableUsers.map((user) => (
                <MenuCheckboxItem
                  checked={assignees.includes(user.login)}
                  key={user.login}
                  onCheckedChange={(checked) => toggleAssignee(user.login, checked)}
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
            </MenuPopup>
          </Menu>

          {isGithubIssue && (
            <Menu>
              <MenuTrigger render={<Button size="sm" variant="outline" />}>
                <Milestone className="size-3.5" /> Milestone{" "}
                <ChevronDown className="size-3.5" />
              </MenuTrigger>
              <MenuPopup align="end" className="min-w-56">
                <MenuGroupLabel>Set milestone</MenuGroupLabel>
                {metadataLoading && (
                  <MenuItem disabled>Loading milestones…</MenuItem>
                )}
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
          )}

          {/* GitHub nests close reasons under one action; three sibling
              buttons was not how the provider models this. */}
          {showIssueClose && (
            <Menu>
              <MenuTrigger render={<Button size="sm" variant="outline" />}>
                <Check className="size-3.5" /> Close issue{" "}
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

          {kind === "pull-request" && state === "open" && (
            <AlertDialog>
              <AlertDialogTrigger render={<Button size="sm" variant="default" />}>
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
      </div>

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

      <div className="rounded-lg border border-border/80 bg-muted/25 p-3">
        <div className="mb-2 flex items-center gap-1.5 font-medium text-sm">
          <MessageSquare className="size-3.5" /> Add a comment
        </div>
        <Textarea
          aria-label="Comment"
          onChange={(event) => setComment(event.target.value)}
          placeholder="Leave a comment on GitHub…"
          rows={3}
          value={comment}
        />
        <div className="mt-2 flex justify-end">
          <Button
            disabled={addComment.isPending || !comment.trim()}
            onClick={() => addComment.mutate()}
            size="sm"
          >
            {addComment.isPending && (
              <LoaderCircle className="size-3.5 animate-spin" />
            )}
            Submit comment
          </Button>
        </div>
      </div>
    </section>
  );
}
