import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DefaultAvatar from "./default-avatar";

describe("DefaultAvatar", () => {
  it("renders the same markup for the same id and kind", () => {
    const first = render(
      <DefaultAvatar id="agent-123" kind="agent" name="Release bot" />,
    );
    const second = render(
      <DefaultAvatar id="agent-123" kind="agent" name="Release bot" />,
    );
    expect(first.container.innerHTML).toBe(second.container.innerHTML);
  });

  it("does not depend on the display name for its structure", () => {
    const first = render(<DefaultAvatar id="org-1" kind="org" name="Noov" />);
    const second = render(
      <DefaultAvatar id="org-1" kind="org" name="Something else" />,
    );
    // The org monogram derives from the name, but the badge structure (tile,
    // ring, text anchor) is fixed.
    for (const { container } of [first, second]) {
      expect(container.querySelector("rect")).not.toBeNull();
      expect(container.querySelector("circle")).not.toBeNull();
      expect(container.querySelector("text")).not.toBeNull();
    }
  });

  it("differs between two ids of the same kind", () => {
    const first = render(<DefaultAvatar id="team-a" kind="team" name="Core" />);
    const second = render(<DefaultAvatar id="team-b" kind="team" name="Ops" />);
    expect(first.container.innerHTML).not.toBe(second.container.innerHTML);
    const firstAgent = render(
      <DefaultAvatar id="agent-a" kind="agent" name="One" />,
    );
    const secondAgent = render(
      <DefaultAvatar id="agent-b" kind="agent" name="Two" />,
    );
    expect(firstAgent.container.innerHTML).not.toBe(
      secondAgent.container.innerHTML,
    );
  });

  it("produces distinct structures for the four kinds", () => {
    const kinds = [
      ["member", "Ayu Saraswati"],
      ["agent", "Release bot"],
      ["team", "Platform"],
      ["org", "Noovoleum"],
    ] as const;
    const markup = kinds.map(
      ([kind, name]) =>
        render(<DefaultAvatar id="shared-id" kind={kind} name={name} />)
          .container.innerHTML,
    );
    for (let i = 0; i < markup.length; i += 1) {
      for (let j = i + 1; j < markup.length; j += 1) {
        expect(markup[i]).not.toBe(markup[j]);
      }
    }
  });

  it("member keeps initials, agent carries no text", () => {
    const member = render(
      <DefaultAvatar id="user-1" kind="member" name="Ayu Saraswati" />,
    );
    expect(member.container.textContent).toBe("AS");

    const agent = render(
      <DefaultAvatar id="agent-1" kind="agent" name="Release bot" />,
    );
    expect(agent.container.textContent).toBe("");
  });

  it("agent and team render library avatars as images seeded by id", () => {
    const agent = render(
      <DefaultAvatar id="agent-1" kind="agent" name="Release bot" />,
    );
    const img = agent.container.querySelector("img[data-kind='agent']");
    expect(img).not.toBeNull();
    const src = img?.getAttribute("src") ?? "";
    expect(src).toMatch(/^data:image\/svg\+xml/);
    // Deterministic: same id → same data URI.
    const again = render(
      <DefaultAvatar id="agent-1" kind="agent" name="Release bot" />,
    );
    expect(again.container.querySelector("img")?.getAttribute("src")).toBe(src);

    const team = render(
      <DefaultAvatar id="team-1" kind="team" name="Platform" />,
    );
    expect(
      team.container.querySelector("img[data-kind='team']"),
    ).not.toBeNull();
  });
});
