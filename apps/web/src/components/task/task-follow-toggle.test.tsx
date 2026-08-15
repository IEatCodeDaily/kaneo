import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TaskFollowToggle from "./task-follow-toggle";

/**
 * KFL-339: subscribe yourself to a ticket's notifications.
 *
 * The control lives in the ACTION BUTTON GROUP (alongside copy-link and
 * copy-branch), not in the property-chip row. Three things this pins down:
 *
 *  1. PLACEMENT/STYLE. It is an icon-only segmented action button — outline
 *     variant, no text label — so it matches its siblings in that group rather
 *     than the property pills.
 *  2. STATE. Following renders a FILLED bell; not-following renders a hollow
 *     bell with a diagonal slash (BellOff). "Filled" is asserted via the SVG
 *     fill, because a hollow and a filled bell are otherwise the same glyph.
 *  3. PERMISSION. The backend gates following on READ access, not task:update,
 *     because following is a personal subscription — never gate on edit rights.
 */

const followingState = { following: false };
const setFollowing = vi.fn();

vi.mock("@/hooks/queries/task/use-get-task-following", () => ({
  default: () => ({ data: followingState, isPending: false }),
}));

vi.mock("@/hooks/mutations/task/use-set-task-following", () => ({
  default: () => ({ mutate: setFollowing, isPending: false }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "tasks:properties.follow": "Follow",
        "tasks:properties.following": "Following",
      })[key] ?? key,
  }),
}));

afterEach(() => {
  followingState.following = false;
  setFollowing.mockReset();
  cleanup();
});

describe("KFL-339 follow toggle", () => {
  it("renders as an icon-only action button, not a labelled property chip", () => {
    render(<TaskFollowToggle taskId="task-1" />);

    const button = screen.getByTestId("task-follow-toggle");
    // No visible text label — the action group is icons only.
    expect(button.textContent?.trim()).toBe("");
    // Accessible name still required for screen readers.
    expect(button).toHaveAccessibleName("Follow");
  });

  it("shows a hollow slashed bell when NOT following", () => {
    followingState.following = false;
    render(<TaskFollowToggle taskId="task-1" />);

    const icon = screen.getByTestId("task-follow-toggle").querySelector("svg");
    expect(icon).toBeTruthy();
    expect(icon?.getAttribute("data-follow-state")).toBe("not-following");
    // Hollow: outline only, no fill.
    expect(icon?.getAttribute("fill")).toBe("none");
  });

  it("shows a FILLED bell when following", () => {
    followingState.following = true;
    render(<TaskFollowToggle taskId="task-1" />);

    const icon = screen.getByTestId("task-follow-toggle").querySelector("svg");
    expect(icon?.getAttribute("data-follow-state")).toBe("following");
    // Filled: the glyph is painted, not just outlined.
    expect(icon?.getAttribute("fill")).toBe("currentColor");
  });

  it("subscribes on click", () => {
    followingState.following = false;
    render(<TaskFollowToggle taskId="task-1" />);

    fireEvent.click(screen.getByTestId("task-follow-toggle"));
    expect(setFollowing).toHaveBeenCalledWith({
      taskId: "task-1",
      following: true,
    });
  });

  it("unsubscribes on click when already following", () => {
    followingState.following = true;
    render(<TaskFollowToggle taskId="task-1" />);

    fireEvent.click(screen.getByTestId("task-follow-toggle"));
    expect(setFollowing).toHaveBeenCalledWith({
      taskId: "task-1",
      following: false,
    });
  });

  it("exposes pressed state for assistive tech", () => {
    followingState.following = true;
    render(<TaskFollowToggle taskId="task-1" />);

    expect(screen.getByTestId("task-follow-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("renders nothing without a task id", () => {
    render(<TaskFollowToggle taskId={undefined} />);
    expect(screen.queryByTestId("task-follow-toggle")).toBeNull();
  });
});
