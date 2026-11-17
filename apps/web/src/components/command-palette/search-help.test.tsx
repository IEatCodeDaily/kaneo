import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  Highlight,
  SearchHelp,
  SearchShortcut,
  searchSnippet,
} from "./search-help";

vi.mock("@/hooks/use-keyboard-shortcuts", () => ({
  getModifierKeyText: () => "Ctrl",
}));
describe("search hints", () => {
  it("lists key, filter and quoted-name syntax", () => {
    render(<SearchHelp />);
    expect(screen.getByTestId("search-help")).toHaveTextContent("KFL-123");
    expect(screen.getByTestId("search-help")).toHaveTextContent(
      "status:in-progress",
    );
    expect(screen.getByTestId("search-help")).toHaveTextContent(
      'assignee:"Ayu Saraswati"',
    );
  });
  it("shows the modifier shortcut, not the slash alias", () => {
    const { container } = render(<SearchShortcut />);
    expect(container.querySelector("kbd")?.textContent).toBe("Ctrl K");
    expect(container.querySelector("kbd")?.textContent).not.toBe("/");
  });
  it("highlights literal words without treating filters as terms or injecting HTML", () => {
    const { container } = render(
      <Highlight
        text="Pressure <script>control</script>"
        query="pressure control is:open"
      />,
    );
    expect(container.querySelectorAll("mark")).toHaveLength(2);
    expect(container.querySelector("script")).toBeNull();
  });
  it("centres snippets on a match and strips markup", () => {
    const snippet = searchSnippet(
      `${"padding ".repeat(40)}<p>Pressure **control**</p>`,
      "pressure",
    );
    expect(snippet).toContain("Pressure control");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet).not.toContain("<p>");
  });
});
