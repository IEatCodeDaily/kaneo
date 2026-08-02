import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useShortcutCategories } from "./keyboard-shortcuts-help";

/**
 * #115: "A help popup to show all the shortcuts in Task title, Task
 * description, comments. @ / # etc."
 *
 * The dialog already documented global/navigation shortcuts but said nothing
 * about the editor sigils, which is the half the ticket actually asks for.
 * These assert the documented inventory, so dropping a section fails here.
 *
 * Every entry below is verified against the code that implements it:
 *   # @ !  -> lib/title-token-autocomplete.ts
 *   @      -> task/extensions/mention-suggestion.tsx (description + comments)
 *   /      -> task-description.tsx slash menu
 */
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/use-keyboard-shortcuts", () => ({
  getModifierKeyText: () => "Ctrl",
}));

/*
 * The module imports ui/dialog, which pulls in the real i18n bootstrap and
 * blows up during collection. Only the categories hook is under test here, so
 * the dialog primitives are stubbed out.
 */
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

afterEach(cleanup);

function Probe() {
  const categories = useShortcutCategories();
  return (
    <ul>
      {categories.map((category) => (
        <li key={category.title} data-testid={category.title}>
          {category.shortcuts.map((shortcut) => (
            <span
              key={shortcut.description}
              data-keys={shortcut.keys.join("+")}
            >
              {shortcut.description}
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

describe("#115 editor shortcuts are documented", () => {
  it("documents the ticket title sigils", () => {
    render(<Probe />);
    const section = screen.getByTestId(
      "navigation:keyboardShortcuts.categories.ticketTitle",
    );
    const keys = Array.from(section.querySelectorAll("[data-keys]")).map((n) =>
      n.getAttribute("data-keys"),
    );
    expect(keys).toEqual(["#", "@", "!"]);
  });

  it("documents the description and comment shortcuts", () => {
    render(<Probe />);
    const section = screen.getByTestId(
      "navigation:keyboardShortcuts.categories.editor",
    );
    const keys = Array.from(section.querySelectorAll("[data-keys]")).map((n) =>
      n.getAttribute("data-keys"),
    );
    // #156: @ and # are different pickers — members vs tickets.
    expect(keys).toEqual(["@", "#", "/"]);
  });

  /**
   * #156: "says 'Mention a person or ticket' with @ ... when it should be @
   * for members (user and agents), and # for tickets."
   *
   * Verified in code: @ -> extensions/mention-suggestion (members),
   * # -> extensions/reference-suggestion (tickets).
   */
  it("does not describe @ as a way to reference a ticket", () => {
    render(<Probe />);
    const section = screen.getByTestId(
      "navigation:keyboardShortcuts.categories.editor",
    );
    const rows = Array.from(section.querySelectorAll("[data-keys]"));
    const at = rows.find((n) => n.getAttribute("data-keys") === "@");
    const hash = rows.find((n) => n.getAttribute("data-keys") === "#");

    expect(at?.textContent).toBe(
      "navigation:keyboardShortcuts.items.editorMention",
    );
    expect(hash?.textContent).toBe(
      "navigation:keyboardShortcuts.items.editorTicket",
    );
    // The two must not share a description.
    expect(at?.textContent).not.toBe(hash?.textContent);
  });

  // The pre-existing global sections must survive the addition.
  it("keeps the general shortcuts section", () => {
    render(<Probe />);
    expect(
      screen.getByTestId("navigation:keyboardShortcuts.categories.general"),
    ).toBeInTheDocument();
  });
});
