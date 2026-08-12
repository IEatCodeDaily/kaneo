import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #110: the task hover preview took ~600ms to appear. The wrapper in
 * components/ui/preview-card accepted `openDelay`/`closeDelay` and discarded
 * them (`void openDelay`), so Base UI's 600ms trigger default applied and the
 * TASK_PREVIEW_* constants were dead. The delays now reach the trigger.
 */

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@base-ui/react/preview-card", () => ({
  PreviewCard: {
    Popup: ({ children, ...props }: Record<string, unknown>) => (
      <div {...props}>{children as React.ReactNode}</div>
    ),
    Portal: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Positioner: ({ children }: { children?: React.ReactNode }) => (
      <>{children}</>
    ),
    Root: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Trigger: ({
      children,
      closeDelay,
      delay,
      render: _render,
      ...props
    }: Record<string, unknown> & { children?: React.ReactNode }) => (
      <div
        data-close-delay={String(closeDelay)}
        data-delay={String(delay)}
        data-testid="trigger-spy"
        {...props}
      >
        {children}
      </div>
    ),
  },
}));

import {
  TASK_PREVIEW_CLOSE_DELAY,
  TASK_PREVIEW_OPEN_DELAY,
} from "@/components/kanban-board/task-hover-preview";
import { HoverCard, HoverCardTrigger } from "@/components/ui/preview-card";

afterEach(() => cleanup());

describe("task hover preview delay (#110)", () => {
  it("uses a snappy open delay constant", () => {
    expect(TASK_PREVIEW_OPEN_DELAY).toBeLessThanOrEqual(150);
    expect(TASK_PREVIEW_CLOSE_DELAY).toBeLessThanOrEqual(150);
  });

  it("forwards the root openDelay to the Base UI trigger's delay prop", () => {
    render(
      <HoverCard closeDelay={80} openDelay={150}>
        <HoverCardTrigger>hover me</HoverCardTrigger>
      </HoverCard>,
    );

    const trigger = screen.getByTestId("trigger-spy");
    expect(trigger.getAttribute("data-delay")).toBe("150");
    expect(trigger.getAttribute("data-close-delay")).toBe("80");
  });

  it("does not fall back to Base UI's 600ms default", () => {
    render(
      <HoverCard
        closeDelay={TASK_PREVIEW_CLOSE_DELAY}
        openDelay={TASK_PREVIEW_OPEN_DELAY}
      >
        <HoverCardTrigger>hover me</HoverCardTrigger>
      </HoverCard>,
    );

    const delay = Number(
      screen.getByTestId("trigger-spy").getAttribute("data-delay"),
    );
    expect(delay).not.toBe(600);
    expect(delay).toBe(TASK_PREVIEW_OPEN_DELAY);
  });

  it("lets an explicit trigger-level delay win over the root value", () => {
    render(
      <HoverCard openDelay={150}>
        <HoverCardTrigger delay={0}>hover me</HoverCardTrigger>
      </HoverCard>,
    );

    expect(screen.getByTestId("trigger-spy").getAttribute("data-delay")).toBe(
      "0",
    );
  });

  /**
   * Negative control: with no delay supplied anywhere, nothing is forwarded and
   * Base UI's own default applies. Proves the assertions above read a real
   * forwarded value instead of matching whatever the trigger happens to render.
   */
  it("negative control: forwards undefined when no delay is given", () => {
    render(
      <HoverCard>
        <HoverCardTrigger>hover me</HoverCardTrigger>
      </HoverCard>,
    );

    expect(screen.getByTestId("trigger-spy").getAttribute("data-delay")).toBe(
      "undefined",
    );
  });
});
