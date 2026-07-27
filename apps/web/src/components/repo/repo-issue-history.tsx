import { Clock3, GitBranch, ListTree, MessageSquare } from "lucide-react";
import { MarkdownRenderer } from "@/components/public-board/markdown-renderer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { RepoIssueGithub } from "@/types/repo";

type RepoIssueHistoryProps = { github?: RepoIssueGithub };

function EventIcon({ event }: { event?: string }) {
  if (event === "cross-referenced") return <GitBranch className="size-3.5" />;
  return <Clock3 className="size-3.5" />;
}

function Actor({ actor }: { actor?: RepoIssueGithub["comments"][number]["user"] }) {
  if (!actor) return <span>GitHub</span>;
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
      <Avatar className="size-5">
        <AvatarImage alt={actor.login ?? "GitHub user"} src={actor.avatar_url ?? undefined} />
        <AvatarFallback className="text-[8px]">{actor.login?.slice(0, 2).toUpperCase() ?? "GH"}</AvatarFallback>
      </Avatar>
      {actor.login ?? "GitHub user"}
    </span>
  );
}

export default function RepoIssueHistory({ github }: RepoIssueHistoryProps) {
  if (!github) return null;
  const comments = github.comments ?? [];
  const timeline = (github.timeline ?? []).filter(
    (event) => !["commented", "committed"].includes(event.event ?? ""),
  );
  const subIssues = github.subIssues ?? [];

  return (
    <div className="space-y-7 border-t border-border/80 px-5 py-6 sm:px-6">
      {github.subIssuesSupported && (
        <section>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><ListTree className="size-4" /> Sub-issues</div>
          {subIssues.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sub-issues.</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {subIssues.map((issue) => (
                <a className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50" href={issue.html_url ?? undefined} key={String(issue.id ?? issue.number)} rel="noreferrer" target="_blank">
                  <span className="text-muted-foreground">#{issue.number}</span><span className="min-w-0 truncate">{issue.title}</span>
                </a>
              ))}
            </div>
          )}
        </section>
      )}
      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><MessageSquare className="size-4" /> Discussion</div>
        <div className="space-y-4">
          {comments.map((comment) => (
            <article className="overflow-hidden rounded-lg border" key={String(comment.id)}>
              <header className="flex items-center gap-2 border-b bg-muted/35 px-3 py-2 text-xs text-muted-foreground"><Actor actor={comment.user} /><span>commented</span>{comment.created_at && <time>{new Date(comment.created_at).toLocaleString()}</time>}</header>
              <div className="px-4 py-4">{comment.body ? <MarkdownRenderer content={comment.body} /> : <span className="italic text-sm text-muted-foreground">No content</span>}</div>
            </article>
          ))}
          {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
        </div>
      </section>
      {timeline.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Clock3 className="size-4" /> History</div>
          <ol className="space-y-3 border-l pl-4">
            {timeline.map((event, index) => (
              <li className="relative text-sm text-muted-foreground" key={`${event.id ?? event.node_id ?? index}-${event.event}`}>
                <span className="absolute -left-[25px] top-0.5 rounded-full border bg-background p-1"><EventIcon event={event.event} /></span>
                <Actor actor={event.actor} /> <span>{event.event?.replaceAll("_", " ") ?? "updated this issue"}</span>
                {event.created_at && <span className="ml-1 text-xs">{new Date(event.created_at).toLocaleString()}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
