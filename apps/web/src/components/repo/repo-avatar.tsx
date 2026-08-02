import { GitBranch } from "lucide-react";
import { useState } from "react";
import type { Repo } from "@/types/repo";

/**
 * Per-repository identity glyph for the collapsed sidebar rail (#96).
 *
 * Boards carry their own `icon` field; repositories do not, so the closest thing
 * to "the repo's own icon" is its owner's avatar on the hosting provider. The
 * avatar URL is derived from the repo's own `url`, so it works for GitHub
 * Enterprise / self-hosted hosts too rather than hardcoding github.com.
 *
 * Any failure to load falls back to the generic repo glyph — a rail slot must
 * never render empty.
 */
export default function RepoAvatar({ repo }: { repo: Repo }) {
  const [failed, setFailed] = useState(false);
  const avatarUrl = ownerAvatarUrl(repo);

  if (!avatarUrl || failed) return <GitBranch aria-hidden="true" />;

  return (
    <img
      alt=""
      aria-hidden="true"
      className="size-4 shrink-0 rounded-sm object-cover"
      onError={() => setFailed(true)}
      src={avatarUrl}
    />
  );
}

/** Owner avatar on the repo's own host, or null when it can't be derived. */
export function ownerAvatarUrl(repo: Pick<Repo, "url" | "owner">) {
  if (!repo.owner) return null;

  try {
    const { origin } = new URL(repo.url);
    // GitHub (and GHE) expose the owner avatar at /<owner>.png.
    return `${origin}/${encodeURIComponent(repo.owner)}.png?size=32`;
  } catch {
    return null;
  }
}
