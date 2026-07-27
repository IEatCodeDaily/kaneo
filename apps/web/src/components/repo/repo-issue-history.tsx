import { GitBranch, GitPullRequest, ListTree } from "lucide-react";
import { MarkdownRenderer } from "@/components/public-board/markdown-renderer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { RepoIssueGithub, RepoIssueGithubActor } from "@/types/repo";

type RepoIssueHistoryProps = { github?: RepoIssueGithub };

// GitHub renders one chronological conversation. Comments and events are the
// same stream, so interleave them by timestamp instead of splitting sections.
type Entry =
  | { kind: "comment"; at: number; comment: RepoIssueGithub["comments"][number] }
  | { kind: "event"; at: number; event: RepoIssueGithub["timeline"][number] };

const HIDDEN_EVENTS = new Set(["commented", "committed", "subscribed", "mentioned"]);

function time(value?: string | null) {
  return value ? new Date(value).getTime() : 0;
}

function Actor({ actor }: { actor?: RepoIssueGithubActor }) {
  const login = actor?.login ?? "GitHub";
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
      <Avatar className="size-5">
        <AvatarImage alt={login} src={actor?.avatar_url ?? undefined} />
        <AvatarFallback className="text-[8px]">{login.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      {login}
    </span>
  );
}

function describe(event: RepoIssueGithub["timeline"][number]) {
  const name = event.event ?? "updated";
  if (name === "closed") {
    return event.state_reason === "not_planned"
      ? "closed this as not planned"
      : event.state_reason === "duplicate"
        ? "closed this as a duplicate"
        : "closed this as completed";
  }
  if (name === "reopened") return "reopened this";
  if (name === "labeled") return `added the ${event.label?.name ?? ""} label`;
  if (name === "unlabeled") return `removed the ${event.label?.name ?? ""} label`;
  if (name === "assigned") return `assigned ${event.assignee?.login ?? "someone"}`;
  if (name === "unassigned") return `unassigned ${event.assignee?.login ?? "someone"}`;
  if (name === "milestoned") return `added this to the ${event.milestone?.title ?? ""} milestone`;
  if (name === "demilestoned") return "removed this from the milestone";
  if (name === "renamed") return "changed the title";
  if (name === "cross-referenced") return "referenced this";
  return name.replaceAll("_", " ");
}

export default function RepoIssueHistory({ github }: RepoIssueHistoryProps) {
  if (!github) return null;
  const linkedPullRequests = github.linkedPullRequests ?? [];
  const subIssues = github.subIssues ?? [];

  const entries: Entry[] = [
    ...(github.comments ?? []).map((comment) => ({
      kind: "comment" as const,
      at: time(comment.created_at),
      comment,
    })),
    ...(github.timeline ?? [])
      .filter((event) => !HIDDEN_EVENTS.has(event.event ?? ""))
      .map((event) => ({ kind: "event" as const, at: time(event.created_at), event })),
  ].sort((a, b) => a.at - b.at);

  return (
    <div className="space-y-7 border-t border-border/80 px-5 py-6 sm:px-6">
      {(github.subIssuesSupported || linkedPullRequests.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {github.subIssuesSupported && (
            <section>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <ListTree className="size-4" /> Sub-issues
              </div>
              {subIssues.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sub-issues.</p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {subIssues.map((issue) => (
                    <a
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50"
                      href={issue.html_url ?? undefined}
                      key={String(issue.id ?? issue.number)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="text-muted-foreground">#{issue.number}</span>
                      <span className="min-w-0 truncate">{issue.title}</span>
                    </a>
                  ))}
                </div>
              )}
            </section>
          )}
          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <GitBranch className="size-4" /> Development
            </div>
            {linkedPullRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No linked pull requests.</p>
            ) : (
              <div className="divide-y rounded-lg border">
                {linkedPullRequests.map((pr) => (
                  <a
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50"
                    href={pr.url ?? undefined}
                    key={pr.number}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <GitPullRequest className="size-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">#{pr.number}</span>
                    <span className="min-w-0 truncate">{pr.title}</span>
                    {pr.mergedAt && <span className="ml-auto text-xs text-purple-500">merged</span>}
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <section>
        <div className="mb-3 text-sm font-semibold">Conversation</div>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="space-y-3 border-l border-border/70 pl-4">
            {entries.map((entry, index) =>
              entry.kind === "comment" ? (
                <li key={`c-${entry.comment.id ?? index}`}>
                  <article className="overflow-hidden rounded-lg border">
                    <header className="flex flex-wrap items-center gap-2 border-b bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
                      <Actor actor={entry.comment.user} />
                      <span>commented</span>
                      {entry.comment.created_at && (
                        <time>{new Date(entry.comment.created_at).toLocaleString()}</time>
                      )}
                    </header>
                    <div className="px-4 py-4">
                      {entry.comment.body ? (
                        <MarkdownRenderer content={entry.comment.body} />
                      ) : (
                        <span className="text-sm italic text-muted-foreground">No content</span>
                      )}
                    </div>
                  </article>
                </li>
              ) : (
                <li
                  className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground"
                  key={`e-${entry.event.id ?? entry.event.node_id ?? index}`}
                >
                  <Actor actor={entry.event.actor} />
                  <span>{describe(entry.event)}</span>
                  {entry.event.created_at && (
                    <time className="text-xs">
                      {new Date(entry.event.created_at).toLocaleString()}
                    </time>
                  )}
                </li>
              ),
            )}
          </ol>
        )}
      </section>
    </div>
  );
}
