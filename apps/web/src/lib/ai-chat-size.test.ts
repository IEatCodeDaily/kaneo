import { describe, expect, it } from "vitest";
import {
  clampAiChatSize,
  DEFAULT_AI_CHAT_SIZE,
  parseAiChatSize,
} from "./ai-chat-size";

describe("AI chat sizing", () => {
  it("clamps below the minimum", () => {
    expect(
      clampAiChatSize({ width: 10, height: 20 }, { width: 1200, height: 900 }),
    ).toEqual({ width: 320, height: 360 });
  });

  it("clamps to the viewport gutters", () => {
    expect(
      clampAiChatSize(
        { width: 2000, height: 2000 },
        { width: 1000, height: 800 },
      ),
    ).toEqual({ width: 968, height: 760 });
  });

  it("parses valid persisted dimensions", () => {
    expect(parseAiChatSize('{"width":500,"height":600}')).toEqual({
      width: 500,
      height: 600,
    });
  });

  it("rejects corrupt persisted values", () => {
    expect(parseAiChatSize("not-json")).toBeNull();
    expect(parseAiChatSize('{"width":"wide","height":600}')).toBeNull();
    expect(parseAiChatSize(null)).toBeNull();
  });

  it("keeps the established default size", () => {
    expect(DEFAULT_AI_CHAT_SIZE).toEqual({ width: 384, height: 512 });
  });
});
