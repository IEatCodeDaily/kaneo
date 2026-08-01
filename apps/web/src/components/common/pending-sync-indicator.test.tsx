import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PendingSyncIndicator } from "./pending-sync-indicator";

afterEach(cleanup);

describe("PendingSyncIndicator", () => {
  it("shows only while the optimistic change awaits server confirmation", () => {
    const { rerender } = render(<PendingSyncIndicator pending={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(<PendingSyncIndicator pending />);
    expect(screen.getByRole("status")).toHaveTextContent("Saving changes…");
  });
});
