import { GitBranch } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Repo } from "@/types/repo";

/**
 * Per-repository identity glyph for the sidebar rail (#96).
 *
 * #173: this used to render the owner's avatar from the hosting provider
 * (`https://github.com/<owner>.png`). That was a mistake:
 *   - every rail render fired cross-site requests to github.com;
 *   - owners without an avatar produced console 404s;
 *   - the browser logged rejected `_gh_sess` / `_octo` cookie warnings, i.e.
 *     we were leaking the user's presence to GitHub just to draw a 16px icon.
 *
 * Repositories carry no icon field of their own, so identity is now derived
 * locally: the owner/name initial over a deterministic colour from the shared
 * label palette. No network, no third-party cookies, works offline and for
 * self-hosted providers.
 *
 * #171 will make board/repo icons user-configurable (including emoji); this is
 * the neutral default until then.
 */
export default function RepoAvatar({
  repo,
  className,
}: {
  repo: Repo;
  className?: string;
}) {
  const initial = repoInitial(repo);

  if (!initial) {
    return <GitBranch aria-hidden="true" className={cn("size-4", className)} />;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-sm text-[9px] font-semibold uppercase leading-none text-white",
        className,
      )}
      data-testid="repo-avatar"
      style={{ backgroundColor: repoColor(repo) }}
    >
      {initial}
    </span>
  );
}

/** First character of the repository name, or null when there isn't one. */
export function repoInitial(repo: Pick<Repo, "name">) {
  const trimmed = (repo.name ?? "").trim();
  return trimmed ? Array.from(trimmed)[0] : null;
}

/**
 * Deterministic colour for a repository.
 *
 * Same repo always gets the same colour, so the rail is stable between renders
 * and reloads without storing anything.
 */
export function repoColor(repo: Pick<Repo, "owner" | "name">) {
  const key = `${repo.owner ?? ""}/${repo.name ?? ""}`;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 360;
  }
  return `hsl(${hash} 55% 45%)`;
}
