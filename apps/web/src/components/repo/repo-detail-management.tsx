import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Edit3,
  GitMerge,
  LoaderCircle,
  MessageSquare,
  Tags,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { getApiUrl } from "@/fetchers/get-api-url";
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
};

type UpdatePayload = {
  title?: string;
  body?: string;
  state?: "open" | "closed";
  labels?: string[];
  assignees?: string[];
};

const splitValues = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];

export default function RepoDetailManagement({
  kind,
  repoId,
  number,
  title,
  body,
  state,
  labels,
  assignees = [],
}: RepoDetailManagementProps) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftBody, setDraftBody] = useState(body ?? "");
  const [draftLabels, setDraftLabels] = useState(
    labels.map((label) => label.name).join(", "),
  );
  const [draftAssignees, setDraftAssignees] = useState(assignees.join(", "));
  const resourcePath = `/repo/${repoId}/${kind === "issue" ? "issues" : "pull-requests"}/${number}`;
  const queryKey = [
    kind === "issue" ? "repo-issue" : "repo-pull-request",
    repoId,
    number,
  ];

  useEffect(() => {
    setDraftTitle(title);
    setDraftBody(body ?? "");
    setDraftLabels(labels.map((label) => label.name).join(", "));
    setDraftAssignees(assignees.join(", "));
  }, [assignees, body, labels, title]);

  const request = async (path: string, init: RequestInit) => {
    const response = await fetch(getApiUrl(path), {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init.headers },
      ...init,
    });
    if (!response.ok)
      throw new Error((await response.text()) || "GitHub update failed");
  };

  const update = useMutation({
    mutationFn: (payload: UpdatePayload) =>
      request(resourcePath, { body: JSON.stringify(payload), method: "PATCH" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["repo", repoId] });
    },
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
      await queryClient.invalidateQueries({ queryKey: ["repo", repoId] });
      toast.success("Pull request merged.");
    },
    onError: () => toast.error("Could not merge the pull request."),
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

  const saveMetadata = async () => {
    try {
      await update.mutateAsync({
        assignees: splitValues(draftAssignees),
        labels: splitValues(draftLabels),
      });
      setMetadataOpen(false);
      toast.success("Labels and assignees updated.");
    } catch {
      toast.error("Could not update labels and assignees.");
    }
  };

  const changeState = async () => {
    try {
      await update.mutateAsync({ state: state === "open" ? "closed" : "open" });
      toast.success(
        state === "open" ? "Closed on GitHub." : "Reopened on GitHub.",
      );
    } catch {
      toast.error("Could not update the state.");
    }
  };

  const isPending = update.isPending || addComment.isPending || merge.isPending;
  const name = kind === "issue" ? "issue" : "pull request";

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
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger render={<Button size="sm" variant="outline" />}>
              <Edit3 className="size-3.5" /> Edit
            </DialogTrigger>
            <DialogPopup>
              <DialogHeader>
                <DialogTitle>Edit {name}</DialogTitle>
                <DialogDescription>
                  Update the title and description in GitHub.
                </DialogDescription>
              </DialogHeader>
              <DialogPanel className="space-y-4">
                <Input
                  aria-label="Title"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                />
                <Textarea
                  aria-label="Description"
                  value={draftBody}
                  onChange={(event) => setDraftBody(event.target.value)}
                  rows={8}
                />
              </DialogPanel>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)}>
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
          <Dialog open={metadataOpen} onOpenChange={setMetadataOpen}>
            <DialogTrigger render={<Button size="sm" variant="outline" />}>
              <Tags className="size-3.5" /> Labels & assignees
            </DialogTrigger>
            <DialogPopup>
              <DialogHeader>
                <DialogTitle>Labels and assignees</DialogTitle>
                <DialogDescription>
                  Use comma-separated GitHub label names and usernames.
                </DialogDescription>
              </DialogHeader>
              <DialogPanel className="space-y-4">
                <div className="grid gap-1.5 font-medium text-sm">
                  <span>Labels</span>
                  <Input
                    aria-label="Labels"
                    placeholder="bug, priority"
                    value={draftLabels}
                    onChange={(event) => setDraftLabels(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5 font-medium text-sm">
                  <span>Assignees</span>
                  <Input
                    aria-label="Assignees"
                    placeholder="octocat, hubot"
                    value={draftAssignees}
                    onChange={(event) => setDraftAssignees(event.target.value)}
                  />
                </div>
              </DialogPanel>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setMetadataOpen(false)}
                >
                  Cancel
                </Button>
                <Button disabled={update.isPending} onClick={saveMetadata}>
                  {update.isPending && (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  )}
                  Save
                </Button>
              </DialogFooter>
            </DialogPopup>
          </Dialog>
          {state !== "merged" && (
            <Button
              disabled={isPending}
              onClick={changeState}
              size="sm"
              variant="outline"
            >
              <Check className="size-3.5" />
              {state === "open" ? "Close" : "Reopen"}
            </Button>
          )}
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
                    This will merge the open pull request in GitHub. This action
                    cannot be undone here.
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
      <div className="rounded-lg border border-border/80 bg-muted/25 p-3">
        <div className="mb-2 flex items-center gap-1.5 font-medium text-sm">
          <MessageSquare className="size-3.5" /> Add a comment
        </div>
        <Textarea
          aria-label="Comment"
          placeholder="Leave a comment on GitHub…"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
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
