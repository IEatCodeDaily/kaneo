import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Repo } from "@/types/repo";
import RepoAvatar, { repoColor, repoInitial } from "./repo-avatar";

/**
 * #173: the sidebar repo glyph used to be the owner's avatar fetched from the
 * hosting provider (`https://github.com/<owner>.png`). That produced console
 * 404s for owners without an avatar, and rejected-cookie warnings for
 * `_gh_sess` / `_octo` — leaking the user's presence to GitHub to draw a 16px
 * icon. The glyph must now be rendered locally with no network access at all.
 */

function repo(partial: Partial<Repo> = {}): Repo {
  return {
    id: "r1",
    owner: "acme",
    name: "widgets",
    url: "https://github.com/acme/widgets",
    ...partial,
  } as Repo;
}

afterEach(cleanup);

describe("#173 repo glyph makes no third-party requests", () => {
  it("renders no <img> and no external URL", () => {
    const { container } = render(<RepoAvatar repo={repo()} />);

    // The regression: an <img src="https://github.com/..."> lived here.
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("github.com");
    expect(container.innerHTML).not.toContain("http");
  });

  it("shows the repository initial as the shipped uppercase SVG glyph", () => {
    render(<RepoAvatar repo={repo({ name: "widgets" })} />);
    const avatar = screen.getByTestId("repo-avatar");
    expect(avatar.tagName).toBe("svg");
    expect(avatar.textContent).toBe("W");
  });

  it("falls back to the generic glyph when there is no name", () => {
    const { container } = render(<RepoAvatar repo={repo({ name: "" })} />);
    expect(screen.queryByTestId("repo-avatar")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("repoInitial", () => {
  it("takes the first character of the name", () => {
    expect(repoInitial({ name: "kaneo" })).toBe("k");
    expect(repoInitial({ name: "  spaced" })).toBe("s");
  });

  it("returns null for an empty name", () => {
    expect(repoInitial({ name: "" })).toBeNull();
    expect(repoInitial({ name: "   " })).toBeNull();
  });

  // Multi-byte names must not be split mid-codepoint.
  it("handles non-ASCII names", () => {
    expect(repoInitial({ name: "日本語" })).toBe("日");
  });
});

describe("RepoAvatar", () => {
  it("renders a configured Lucide icon", () => {
    render(<RepoAvatar repo={repo({ config: { icon: "Rocket" } })} />);

    const avatar = screen.getByTestId("repo-avatar");
    expect(avatar).toHaveAttribute("data-icon-kind", "lucide");
    expect(avatar).toHaveClass("lucide-rocket");
    expect(avatar.tagName).toBe("svg");
    expect(avatar).not.toHaveTextContent("W");
  });

  it("renders a configured emoji inside an SVG for collapsed-sidebar visibility", () => {
    render(<RepoAvatar repo={repo({ config: { icon: "🚀" } })} />);

    const avatar = screen.getByTestId("repo-avatar");
    expect(avatar.tagName).toBe("svg");
    expect(avatar).toHaveAttribute("data-icon-kind", "emoji");
    expect(avatar).toHaveTextContent("🚀");
  });

  it("falls back to the deterministic initial for invalid configured icons", () => {
    render(<RepoAvatar repo={repo({ config: { icon: "not-an-icon" } })} />);

    const avatar = screen.getByTestId("repo-avatar");
    expect(avatar).toHaveTextContent("W");
    expect(avatar).not.toHaveAttribute("data-icon-kind");
    expect(avatar).not.toHaveClass("lucide-layout");
  });

  it("keeps the unique initial for GitHub repositories", () => {
    render(<RepoAvatar repo={repo({ provider: "github", name: "widgets" })} />);
    expect(screen.getByTestId("repo-avatar")).toHaveTextContent("W");
    expect(document.querySelector("svg.lucide-github")).not.toBeInTheDocument();
  });

  it("is deterministic for the same repository", () => {
    const a = repoColor({ owner: "acme", name: "widgets" });
    const b = repoColor({ owner: "acme", name: "widgets" });
    expect(a).toBe(b);
    expect(a).toMatch(/^hsl\(\d+ 55% 45%\)$/);
  });

  // NEGATIVE CONTROL: a constant colour would satisfy determinism above, so
  // different repositories must actually differ.
  it("differs between repositories", () => {
    const colors = new Set(
      [
        { owner: "acme", name: "widgets" },
        { owner: "acme", name: "gadgets" },
        { owner: "other", name: "widgets" },
      ].map(repoColor),
    );
    expect(colors.size).toBe(3);
  });
});
