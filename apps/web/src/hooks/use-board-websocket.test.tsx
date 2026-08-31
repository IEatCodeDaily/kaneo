import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub the session so the hook proceeds past its auth guard.
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "u1" } } }) },
}));

/** Minimal WebSocket stand-in that records opens and closes. */
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.OPEN;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send() {}
  close() {
    this.closed = true;
  }
  addEventListener() {}
}

let useBoardWebSocket: (boardId: string) => void;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useBoardWebSocket connection sharing", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.resetModules();
    // Fresh module per test: the connection map is module-scoped by design.
    ({ useBoardWebSocket } = await import("./use-board-websocket"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens one socket for concurrent subscribers of the same board", () => {
    const a = renderHook(() => useBoardWebSocket("board-1"), { wrapper });
    const b = renderHook(() => useBoardWebSocket("board-1"), { wrapper });

    expect(FakeWebSocket.instances).toHaveLength(1);

    a.unmount();
    b.unmount();
  });

  it("survives a view switch on the same board", () => {
    // This is the regression: board/gantt/calendar each mount their own
    // BoardLayout, so a switch unmounts one subscriber and mounts another.
    const outgoing = renderHook(() => useBoardWebSocket("board-1"), {
      wrapper,
    });
    const socket = FakeWebSocket.instances[0];

    const incoming = renderHook(() => useBoardWebSocket("board-1"), {
      wrapper,
    });
    outgoing.unmount();

    vi.advanceTimersByTime(30_000);

    expect(socket.closed).toBe(false);
    expect(FakeWebSocket.instances).toHaveLength(1);

    incoming.unmount();
  });

  it("closes the socket once nobody comes back", () => {
    const only = renderHook(() => useBoardWebSocket("board-1"), { wrapper });
    const socket = FakeWebSocket.instances[0];

    only.unmount();
    expect(socket.closed).toBe(false); // still inside the grace period

    vi.advanceTimersByTime(30_000);
    expect(socket.closed).toBe(true);
  });

  it("uses separate sockets for different boards", () => {
    const a = renderHook(() => useBoardWebSocket("board-1"), { wrapper });
    const b = renderHook(() => useBoardWebSocket("board-2"), { wrapper });

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[0].url).toContain("board-1");
    expect(FakeWebSocket.instances[1].url).toContain("board-2");

    a.unmount();
    b.unmount();
  });
});

describe("task lifecycle invalidation (KFL-376)", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.resetModules();
    ({ useBoardWebSocket } = await import("./use-board-websocket"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function mountWithClient() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const clientWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const hook = renderHook(() => useBoardWebSocket("board-1"), {
      wrapper: clientWrapper,
    });
    return { client, hook };
  }

  for (const type of [
    "TASK_CREATED",
    "TASK_UPDATED",
    "TASK_DELETED",
    "TASK_MOVED",
  ] as const) {
    it(`invalidates search and parent-candidate caches on ${type}`, () => {
      const { client, hook } = mountWithClient();
      const spy = vi.spyOn(client, "invalidateQueries");

      FakeWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({ type, boardId: "board-1", taskId: "t1" }),
      } as MessageEvent);

      const keys = spy.mock.calls.map(
        (c) => (c[0] as { queryKey: unknown[] }).queryKey[0],
      );
      expect(keys).toContain("search");
      expect(keys).toContain("parent-candidates");

      hook.unmount();
    });
  }
});
