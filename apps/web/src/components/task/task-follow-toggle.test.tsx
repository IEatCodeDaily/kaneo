import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TaskFollowToggle from "./task-follow-toggle";

/**
 * KFL-339: users must be able to subscribe themselves to a ticket's
 * notifications.
 *
 * Two things this pins down that were easy to get wrong:
 *
 *  1. STYLING. KFL-337 was filed because the Assign chip lost its outline. The
 *     property chips in that row are outlined pills — `h-7 ... rounded-md
 *     border border-border bg-transparent px-2.5`. This chip must match, so the
 *     test asserts the outline classes rather than eyeballing a screenshot.
 *
 *  2. PERMISSION. The backend gates following on READ access, not task:update,
 *     because following is a personal subscription. So the chip must never be
 *     gated on edit rights.
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
  it("renders as an outlined property chip matching the sibling chips", () => {
    render(<TaskFollowToggle taskId="task-1" />);

    const chip = screen.getByTestId("task-follow-toggle");
    for (const cls of [
      "h-7",
      "rounded-md",
      "border",
      "border-border",
      "bg-transparent",
      "px-2.5",
    ]) {
      expect(chip.className).toContain(cls);
    }
  });

  it("shows Follow when the user is not following", () => {
    render(<TaskFollowToggle taskId="task-1" />);
    expect(screen.getByTestId("task-follow-toggle").textContent).toContain(
      "Follow",
    );
    expect(screen.getByTestId("task-follow-toggle")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  // NEGATIVE CONTROL: without reading the query the label would be a constant
  // and the assertion above would pass on a hardcoded string.
  it("shows Following when the user already follows the ticket", () => {
    followingState.following = true;
    render(<TaskFollowToggle taskId="task-1" />);
    expect(screen.getByTestId("task-follow-toggle").textContent).toContain(
      "Following",
    );
    expect(screen.getByTestId("task-follow-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("subscribes on click", () => {
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

  it("renders nothing without a task id", () => {
    render(<TaskFollowToggle taskId={undefined} />);
    expect(screen.queryByTestId("task-follow-toggle")).toBeNull();
  });
});
