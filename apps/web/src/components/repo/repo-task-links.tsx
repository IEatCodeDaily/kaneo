import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Link2, LoaderCircle, Trash2 } from "lucide-react";
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
    headers: { "Content-Type": "application/json", ...init.headers },
    ...init,
  });
  if (!response.ok)
    throw new Error((await response.text()) || "Task link failed");
}

export default function RepoTaskLinks({
  organizationId,
  repoId,
  number,
  itemType,
  taskLinks = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const { data: boards, isLoading: boardsLoading } = useGetBoards({ organizationId });
  const taskQueries = useQueries({
    queries: (boards ?? []).map((board) => ({
      queryKey: ["tasks", board.id],
      queryFn: () => getTasks(board.id),
      enabled: open,
    })),
  });
  const isLoading = boardsLoading || taskQueries.some((query) => query.isLoading);
  const queryKey = [
    itemType === "issues" ? "repo-issue" : "repo-pull-request",
    repoId,
    number,
  ];
  const existingTaskIds = new Set(taskLinks.map((link) => link.taskId));

  const candidates = useMemo<CandidateTask[]>(() => {
    const result: CandidateTask[] = [];
    for (const [index, board] of (boards ?? []).entries()) {
      const tasks = taskQueries[index]?.data ?? [];
      for (const task of tasks) {
        if (!task.id || !task.title || existingTaskIds.has(task.id)) continue;
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
    return result;
  }, [boards, existingTaskIds, taskQueries]);

  const invalidate = async () => queryClient.invalidateQueries({ queryKey });
  const add = useMutation({
    mutationFn: (taskId: string) =>
      request(`/repo/${repoId}/${itemType}/${number}/task-links`, {
        method: "POST",
        body: JSON.stringify({ taskId }),
      }),
    onSuccess: async () => {
      await invalidate();
      setOpen(false);
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
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not remove task link.",
      ),
  });

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = candidates.filter((task) =>
    `${task.boardSlug}-${task.number ?? ""} ${task.title} ${task.boardName}`
      .toLocaleLowerCase()
      .includes(normalizedSearch),
  );

  return (
    <section className="border-t border-border/80 px-5 py-4 sm:px-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Link2 className="size-4" /> Linked Kaneo tasks
            {taskLinks.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {taskLinks.length}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Connect this GitHub item to work already tracked in Kaneo.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" variant="outline" />}>
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
              <Button onClick={() => setOpen(false)} variant="outline">
                Cancel
              </Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
      </div>
      {taskLinks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Kaneo tasks linked yet.
        </p>
      ) : (
        <div className="space-y-1">
          {taskLinks.map((link) => (
            <div
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/60"
              key={link.id}
            >
              <a
                className="min-w-0 flex-1 truncate text-sm hover:text-primary hover:underline"
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
              <Button
                aria-label={`Remove link to ${link.task.title}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(link.taskId)}
                size="icon-xs"
                variant="ghost"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
