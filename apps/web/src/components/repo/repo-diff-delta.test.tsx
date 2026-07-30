import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RepoDiffDelta from "./repo-diff-delta";

describe("RepoDiffDelta", () => {
  // This project's vitest setup does not auto-clean between cases, so a leaked
  // DOM would make "−0" match a previous render instead of this one.
  afterEach(cleanup);

  it("renders the additions and deletions delta", () => {
    render(<RepoDiffDelta additions={12} deletions={3} />);

    expect(screen.getByText("+12")).toBeInTheDocument();
    expect(screen.getByText("−3")).toBeInTheDocument();
  });

  it("renders the changed file count only when asked", () => {
    const { rerender } = render(
      <RepoDiffDelta additions={1} changedFiles={4} deletions={1} />,
    );
    expect(screen.queryByText("4 files")).not.toBeInTheDocument();

    rerender(
      <RepoDiffDelta
        additions={1}
        changedFiles={4}
        deletions={1}
        showChangedFiles
      />,
    );
    expect(screen.getByText("4 files")).toBeInTheDocument();
  });

  it("singularizes a one-file change", () => {
    render(
      <RepoDiffDelta
        additions={2}
        changedFiles={1}
        deletions={0}
        showChangedFiles
      />,
    );

    expect(screen.getByText("1 file")).toBeInTheDocument();
  });

  it("renders nothing when the delta was never mirrored", () => {
    // "+0 −0" would claim an empty diff instead of unknown data.
    const { container } = render(
      <RepoDiffDelta additions={null} deletions={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("still renders when only one side is known", () => {
    render(<RepoDiffDelta additions={5} deletions={null} />);

    expect(screen.getByText("+5")).toBeInTheDocument();
    expect(screen.getByText("−0")).toBeInTheDocument();
  });
});
