import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LabelSourceIndicator } from "./task-labels-popover";

afterEach(cleanup);

describe("LabelSourceIndicator", () => {
  it("marks a repository label with an accessible GitHub icon", () => {
    const { container } = render(
      <LabelSourceIndicator source="repo" label="GitHub-synced label" />,
    );

    expect(screen.getByLabelText("GitHub-synced label")).toBeInTheDocument();
    expect(container.querySelector(".lucide-github")).toBeInTheDocument();
  });

  it("does not mark a Kaneo-native label", () => {
    const { container } = render(
      <LabelSourceIndicator source="kaneo" label="GitHub-synced label" />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
