import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockIntegration = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.repo ? `${key}:${options.repo}` : key,
  }),
}));

vi.mock(
  "@/hooks/queries/github-integration/use-get-github-integration",
  () => ({ default: () => mockIntegration() }),
);

import BoardSyncIndicator from "./board-sync-indicator";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * #158: "A simple indicator if a board is synced to a repo via integration...
 * 'Synced with <Repo name>' on header, aligned to the right, to the left of
 * the avatars."
 */
describe("BoardSyncIndicator (#158)", () => {
  it("names the repository when the board is synced", () => {
    mockIntegration.mockReturnValue({
      data: {
        isActive: true,
        repositoryOwner: "IEatCodeDaily",
        repositoryName: "kaneo",
      },
    });

    render(<BoardSyncIndicator boardId="board-1" />);

    expect(screen.getByTestId("board-sync-indicator").textContent).toContain(
      "kaneo",
    );
  });

  it("renders nothing when the board has no integration", () => {
    mockIntegration.mockReturnValue({ data: null });

    const { container } = render(<BoardSyncIndicator boardId="board-1" />);

    expect(screen.queryByTestId("board-sync-indicator")).toBeNull();
    expect(container.textContent).toBe("");
  });

  /**
   * A badge claiming a sync that is switched off is worse than no badge — the
   * integration row survives deactivation, so `isActive` must be honoured.
   */
  it("renders nothing when the integration is inactive", () => {
    mockIntegration.mockReturnValue({
      data: { isActive: false, repositoryName: "kaneo" },
    });

    render(<BoardSyncIndicator boardId="board-1" />);

    expect(screen.queryByTestId("board-sync-indicator")).toBeNull();
  });

  it("renders nothing while the query is still loading", () => {
    mockIntegration.mockReturnValue({ data: undefined });

    render(<BoardSyncIndicator boardId="board-1" />);

    expect(screen.queryByTestId("board-sync-indicator")).toBeNull();
  });

  it("puts the owner/name pair in the tooltip", () => {
    mockIntegration.mockReturnValue({
      data: {
        isActive: true,
        repositoryOwner: "IEatCodeDaily",
        repositoryName: "kaneo",
      },
    });

    render(<BoardSyncIndicator boardId="board-1" />);

    expect(
      screen.getByTestId("board-sync-indicator").getAttribute("title"),
    ).toContain("IEatCodeDaily/kaneo");
  });
});
