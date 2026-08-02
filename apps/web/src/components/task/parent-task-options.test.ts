import { describe, expect, it } from "vitest";
import {
  buildParentOptions,
  formatParentLabel,
  searchResultToOption,
} from "./parent-task-options";

/**
 * #154: "should show the ticket number, allow cross board parent ticket
 * linking. selected parent ticket should be pinned to the top, above the no
 * parent ticket option."
 *
 * These drive the same helper the picker renders from.
 */
const boardTasks = [
  { id: "a", title: "Local one", number: 11 },
  { id: "b", title: "Local two", number: 12 },
];

const remote = [
  {
    id: "r1",
    type: "task",
    title: "Other board ticket",
    taskNumber: 99,
    boardId: "other-board",
    boardSlug: "OTH",
  },
];

describe("#154 parent ticket options", () => {
  it("shows the ticket number alongside the title", () => {
    expect(
      formatParentLabel({
        id: "a",
        title: "Local one",
        number: 11,
        boardSlug: null,
        crossBoard: false,
      }),
    ).toBe("#11 Local one");
  });

  it("uses the board key for a cross-board ticket", () => {
    expect(
      formatParentLabel(searchResultToOption(remote[0], "this-board")),
    ).toBe("OTH-99 Other board ticket");
  });

  it("falls back to the bare title when no number is known", () => {
    expect(
      formatParentLabel({
        id: "a",
        title: "No number",
        number: null,
        boardSlug: "KFL",
        crossBoard: false,
      }),
    ).toBe("No number");
  });

  it("includes tickets from other boards in the options", () => {
    const options = buildParentOptions({
      boardTasks,
      searchResults: remote,
      selectedId: null,
      selectedOption: null,
      query: "other",
      currentBoardId: "this-board",
    });

    const crossBoard = options.find((option) => option.id === "r1");
    expect(crossBoard).toBeDefined();
    expect(crossBoard?.crossBoard).toBe(true);
  });

  it("does not mark same-board search hits as cross-board", () => {
    const options = buildParentOptions({
      boardTasks: [],
      searchResults: [{ ...remote[0], boardId: "this-board" }],
      selectedId: null,
      selectedOption: null,
      query: "other",
      currentBoardId: "this-board",
    });

    expect(options[0]?.crossBoard).toBe(false);
  });

  it("pins the selected parent to the top of the list", () => {
    const options = buildParentOptions({
      boardTasks,
      searchResults: [],
      selectedId: "b",
      selectedOption: null,
      query: "",
      currentBoardId: "this-board",
    });

    expect(options[0]?.id).toBe("b");
    // ...and is not duplicated further down.
    expect(options.filter((option) => option.id === "b")).toHaveLength(1);
  });

  /**
   * The cross-board case that would otherwise break: pick a parent from
   * another board, clear the query, and the search results vanish. Without the
   * remembered option the selection would disappear from the list entirely.
   */
  it("keeps a cross-board selection pinned after the query is cleared", () => {
    const selected = searchResultToOption(remote[0], "this-board");
    const options = buildParentOptions({
      boardTasks,
      searchResults: [],
      selectedId: "r1",
      selectedOption: selected,
      query: "",
      currentBoardId: "this-board",
    });

    expect(options[0]?.id).toBe("r1");
    expect(options[0]?.crossBoard).toBe(true);
  });

  it("filters local tickets by number as well as title", () => {
    const options = buildParentOptions({
      boardTasks,
      searchResults: [],
      selectedId: null,
      selectedOption: null,
      query: "12",
      currentBoardId: "this-board",
    });

    expect(options.map((option) => option.id)).toEqual(["b"]);
  });

  it("ignores non-task search results", () => {
    const options = buildParentOptions({
      boardTasks: [],
      searchResults: [{ id: "i1", type: "issue", title: "An issue" }],
      selectedId: null,
      selectedOption: null,
      query: "an",
      currentBoardId: "this-board",
    });

    expect(options).toHaveLength(0);
  });
});
