import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
}));

vi.mock("@kaneo/libs", () => ({
  client: {
    board: {
      ":id": {
        $put: mocks.put,
      },
    },
  },
}));

import updateBoard from "./update-board";

const request = {
  id: "board-1",
  name: "Roadmap",
  icon: "Layout",
  slug: "ROAD",
  description: "Product roadmap",
  isPublic: false,
  subtaskDepthLimit: 2,
};

describe("updateBoard", () => {
  beforeEach(() => {
    mocks.put.mockReset();
    mocks.put.mockResolvedValue({
      ok: true,
      json: async () => ({ ...request }),
    });
  });

  it("includes the subtask depth limit in the update payload", async () => {
    await updateBoard(request);

    expect(mocks.put).toHaveBeenCalledWith({
      param: { id: "board-1" },
      json: {
        name: "Roadmap",
        icon: "Layout",
        slug: "ROAD",
        description: "Product roadmap",
        isPublic: false,
        subtaskDepthLimit: 2,
      },
    });
  });
});
