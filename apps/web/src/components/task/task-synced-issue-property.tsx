import { Github } from "lucide-react";
import useExternalLinks from "@/hooks/queries/external-link/use-external-links";
import type { ExternalLink } from "@/types/external-link";

function repositoryLabel(url: string) {
  try {
    const [owner, repo] = new URL(url).pathname.split("/").filter(Boolean);
    return owner && repo ? `${owner}/${repo}` : null;
  } catch {
    return null;
  }
}

/**
 * The task's canonical **synced** GitHub issue, shown in the detail drawer's
 * status bar (#75).
 *
 * Synced is not the same relationship as Linked:
 *   - **Synced** — the content of this ticket flows to and from that issue.
 *     That is the bidirectional issue in `externalLinks` with
 *     `resourceType === "issue"`, and it is what this component renders.
 *   - **Linked** — "this ticket mentions that issue". Those live in
 *     `repo-links` and appear in the Resources list *without* a Synced badge.
 *
 * History: this was rendered in three places at once (status bar, a block under
 * the label list, and Resources), which read as chaos, so the duplicate block
 * under the labels was removed. It was then briefly stubbed out entirely, which
 * went too far and dropped the remark from the status bar as well — the one
 * place that was explicitly meant to keep it.
 */
export default function TaskSyncedIssueProperty({
  taskId,
  compact = false,
  showLabel = false,
}: {
  taskId: string;
  compact?: boolean;
  showLabel?: boolean;
}) {
  const { data: externalLinks = [] } = useExternalLinks(taskId);
  const issue = (externalLinks as ExternalLink[]).find(
    (link) => link.resourceType === "issue",
  );

  if (!issue) return null;

  const repo = repositoryLabel(issue.url);
  const label = `${repo ? `${repo} ` : ""}#${issue.externalId}`;

  const link = (
    <a
      aria-label={`${label}${issue.title ? ` ${issue.title}` : ""}`}
      className={`flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-xs font-semibold hover:bg-accent ${
        compact ? "max-w-48" : "w-full"
      }`}
      data-testid="task-synced-issue"
      href={issue.url}
      rel="noreferrer"
      target="_blank"
      title={issue.title ?? label}
    >
      <Github className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </a>
  );

  if (!showLabel) return link;

  return (
    <div className="flex flex-col gap-1">
      <span className="px-2 text-xs font-medium text-foreground/70">
        Synced issue
      </span>
      {link}
    </div>
  );
}
