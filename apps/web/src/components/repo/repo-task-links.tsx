import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ExternalLink,
  Link2,
  LoaderCircle,
  RefreshCw,
  Trash2,
  Unplug,
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
import { getApiUrl } from "@/fetchers/get-api-url";
import getTasks from "@/fetchers/task/get-tasks";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import { toast } from "@/lib/toast";
import type { RepoTaskLink } from "@/types/repo";

type Props = {
  organizationId: string;
  repoId: string;
  number: number;
  itemType: "issues" | "pull-requests";
  taskLinks?: RepoTaskLink[];
  compact?: boolean;
};

type CandidateTask = {
  id: string;
  title: string;
  number: number | null;
  boardId: string;
  boardName: string;
  boardSlug: string;
};

async function request(path: string, init: RequestInit) {
  const response = await fetch(getApiUrl(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok)
    throw new Error((await response.text()) || "Request failed");
}

export default function RepoTaskLinks({
  organizationId,
  repoId,
  number,
  itemType,
  taskLinks = [],
  compact = false,
}: Props) {
  const queryClient = useQueryClient();
  const [linkOpen, setLinkOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: boards, isLoading: boardsLoading } = useGetBoards({
    organizationId,
  });
  const taskQueries = useQueries({
    queries: (boards ?? []).map((board) => ({
      queryKey: ["tasks", board.id],
      queryFn: () => getTasks(board.id),
      enabled: linkOpen,
    })),
  });
  const isLoading =
    boardsLoading || taskQueries.some((query) => query.isLoading);
  const [syncOpen, setSyncOpen] = useState(false);
  const [boardId, setBoardId] = useState("");
  const [unsyncLink, setUnsyncLink] = useState<RepoTaskLink | null>(null);
  const queryKey = [
    itemType === "issues" ? "repo-issue" : "repo-pull-request",
    repoId,
    number,
  ];
  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const existingTaskIds = new Set(taskLinks.map((link) => link.taskId));
  const candidates = useMemo<CandidateTask[]>(() => {
    const result: CandidateTask[] = [];
    for (const [index, board] of (boards ?? []).entries()) {
      const payload = taskQueries[index]?.data as
        | {
            columns?: Array<{ tasks?: unknown }>;
            archivedTasks?: unknown;
            plannedTasks?: unknown;
          }
        | undefined;
      const buckets: unknown[] = [
        ...(payload?.columns ?? []).map((column) => column?.tasks),
        payload?.archivedTasks,
        payload?.plannedTasks,
      ];
      for (const bucket of buckets) {
        if (!Array.isArray(bucket)) continue;
        for (const task of bucket as Array<{
          id?: string;
          title?: string;
          number?: number | null;
        }>) {
          if (!task?.id || !task.title || existingTaskIds.has(task.id))
            continue;
          result.push({
            id: task.id,
            title: task.title,
            number: task.number ?? null,
            boardId: board.id,
            boardName: board.name,
            boardSlug: board.slug,
          });
        }
      }
    }
    return result;
  }, [boards, existingTaskIds, taskQueries]);

  const add = useMutation({
    mutationFn: (taskId: string) =>
      request(`/repo/${repoId}/${itemType}/${number}/task-links`, {
        method: "POST",
        body: JSON.stringify({ taskId }),
      }),
    onSuccess: async () => {
      await invalidate();
      setLinkOpen(false);
      setSearch("");
      toast.success("Task linked.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not link task.",
      ),
  });
  const remove = useMutation({
    mutationFn: (taskId: string) =>
      request(`/repo/${repoId}/${itemType}/${number}/task-links/${taskId}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Task link removed.");
    },
  });
  const addSynced = useMutation({
    mutationFn: () =>
      request(`/repo/${repoId}/issues/${number}/synced-tasks`, {
        method: "POST",
        body: JSON.stringify({ boardId }),
      }),
    onSuccess: async () => {
      await invalidate();
      setSyncOpen(false);
      setBoardId("");
      toast.success("Synced task created.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not create synced task.",
      ),
  });
  const retry = useMutation({
    mutationFn: (taskId: string) =>
      request(`/repo/${repoId}/issues/${number}/synced-tasks/${taskId}/retry`, {
        method: "POST",
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Task synced from GitHub.");
    },
  });
  const unsync = useMutation({
    mutationFn: (taskId: string) =>
      request(`/repo/${repoId}/issues/${number}/synced-tasks/${taskId}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await invalidate();
      setUnsyncLink(null);
      toast.success("Task unsynced. The ordinary link remains.");
    },
  });

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = candidates.filter((task) =>
    `${task.boardSlug}-${task.number ?? ""} ${task.title} ${task.boardName}`
      .toLocaleLowerCase()
      .includes(normalizedSearch),
  );
  const linked = taskLinks.filter((link) => !link.syncEnabled);
  const synced = taskLinks.filter((link) => link.syncEnabled);
  const row = (link: RepoTaskLink, isSynced: boolean) => (
    <div
      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/60"
      key={link.id}
    >
      <a
        className="min-w-0 flex-1 truncate text-sm hover:underline"
        href={`/dashboard/organization/${organizationId}/board/${link.task.boardId}/task/${link.task.id}`}
      >
        {link.task.number !== null && (
          <span className="mr-1.5 font-mono text-xs text-muted-foreground">
            #{link.task.number}
          </span>
        )}
        {link.task.title}
        <ExternalLink className="ml-1.5 inline size-3 text-muted-foreground" />
      </a>
      {link.syncBrokenAt && (
        <span
          className="flex items-center gap-1 text-xs text-destructive"
          title={link.syncBrokenReason ?? undefined}
        >
          <AlertTriangle className="size-3.5" /> Broken
        </span>
      )}
      {isSynced ? (
        <>
          <Button
            aria-label={`Retry sync for ${link.task.title}`}
            disabled={!link.syncBrokenAt || retry.isPending}
            onClick={() => retry.mutate(link.taskId)}
            size="icon-xs"
            variant="ghost"
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            aria-label={`Unsync ${link.task.title}`}
            onClick={() => setUnsyncLink(link)}
            size="icon-xs"
            variant="ghost"
          >
            <Unplug className="size-3.5" />
          </Button>
        </>
      ) : (
        <Button
          aria-label={`Remove link to ${link.task.title}`}
          disabled={remove.isPending}
          onClick={() => remove.mutate(link.taskId)}
          size="icon-xs"
          variant="ghost"
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );

  return (
    <section
      className={compact ? "space-y-3" : "border-b border-border/80 px-6 py-5"}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Link2 className="size-4" /> Linked Tasks{" "}
          {linked.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {linked.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
            <DialogTrigger
              render={<Button size={compact ? "xs" : "sm"} variant="outline" />}
            >
              <Link2 className="size-3.5" /> Link task
            </DialogTrigger>
            <DialogPopup>
              <DialogHeader>
                <DialogTitle>Link an existing task</DialogTitle>
                <DialogDescription>
                  This creates a local Kaneo relation; the GitHub issue or pull
                  request remains authoritative.
                </DialogDescription>
              </DialogHeader>
              <DialogPanel className="space-y-3">
                <Input
                  aria-label="Search tasks"
                  autoFocus
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search tasks across this organization…"
                  value={search}
                />
                <div className="max-h-72 overflow-y-auto rounded-md border">
                  {isLoading ? (
                    <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                      <LoaderCircle className="size-4 animate-spin" /> Loading
                      tasks…
                    </p>
                  ) : filtered.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">
                      No unlinked tasks found.
                    </p>
                  ) : (
                    filtered.map((task) => (
                      <button
                        className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-accent disabled:opacity-60"
                        disabled={add.isPending}
                        key={task.id}
                        onClick={() => add.mutate(task.id)}
                        type="button"
                      >
                        <span className="font-mono text-xs text-muted-foreground">
                          {task.boardSlug}-{task.number ?? "—"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {task.title}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {task.boardName}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </DialogPanel>
              <DialogFooter>
                <Button onClick={() => setLinkOpen(false)} variant="outline">
                  Cancel
                </Button>
              </DialogFooter>
            </DialogPopup>
          </Dialog>
          {itemType === "issues" && (
            <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
              <DialogTrigger render={<Button size={compact ? "xs" : "sm"} />}>
                <RefreshCw className="size-3.5" /> Add Synced Task
              </DialogTrigger>
              <DialogPopup>
                <DialogHeader>
                  <DialogTitle>Add Synced Task</DialogTitle>
                  <DialogDescription>
                    Create a new task that follows this GitHub issue. GitHub
                    updates overwrite its title and description.
                  </DialogDescription>
                </DialogHeader>
                <DialogPanel>
                  <label className="space-y-2 text-sm">
                    <span>Board</span>
                    <select
                      aria-label="Board for synced task"
                      className="w-full rounded-md border bg-background px-3 py-2"
                      onChange={(event) => setBoardId(event.target.value)}
                      value={boardId}
                    >
                      <option value="">Select a board…</option>
                      {(boards ?? []).map((board) => (
                        <option key={board.id} value={board.id}>
                          {board.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </DialogPanel>
                <DialogFooter>
                  <Button onClick={() => setSyncOpen(false)} variant="outline">
                    Cancel
                  </Button>
                  <Button
                    disabled={!boardId || addSynced.isPending}
                    onClick={() => addSynced.mutate()}
                  >
                    {addSynced.isPending ? "Creating…" : "Create synced task"}
                  </Button>
                </DialogFooter>
              </DialogPopup>
            </Dialog>
          )}
        </div>
      </div>
      {linked.length === 0 ? (
        <p className="text-sm text-muted-foreground">No linked tasks yet.</p>
      ) : (
        <div className="space-y-1">
          {linked.map((link) => row(link, false))}
        </div>
      )}
      {itemType === "issues" && (
        <div className="border-t pt-3">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <RefreshCw className="size-4" /> Synced Tasks{" "}
            {synced.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {synced.length}
              </span>
            )}
          </div>
          {synced.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tasks follow this issue.
            </p>
          ) : (
            <div className="space-y-1">
              {synced.map((link) => row(link, true))}
            </div>
          )}
        </div>
      )}
      <Dialog
        open={Boolean(unsyncLink)}
        onOpenChange={(open) => !open && setUnsyncLink(null)}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Unsync task?</DialogTitle>
            <DialogDescription>
              The task stops following GitHub updates. The task and ordinary
              link remain.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setUnsyncLink(null)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={unsync.isPending}
              onClick={() => unsyncLink && unsync.mutate(unsyncLink.taskId)}
              variant="destructive"
            >
              Unsync task
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </section>
  );
}
