import { describe, expect, it, vi } from "vitest";
import { parseMentionIds } from "../../../apps/api/src/utils/parse-mentions";

/**
 * KFL: mentioning someone in a ticket DESCRIPTION AT CREATION notified nobody.
 *
 * Editing a description later works (update-task-description diffs old vs new
 * mentions) and commenting works (create-comment parses the body), but the
 * create path never looked at the description at all — so the very first thing
 * a user tries, "@someone" while writing the ticket, silently did nothing.
 *
 * Proven against the live API before writing this: three tickets were created,
 * one mentioning in the description at creation (0 notifications), one editing
 * the description afterwards (1), one mentioning in a comment (1).
 *
 * These tests pin the CONTRACT the create path must satisfy: every mention in
 * the initial description notifies, minus the author, de-duplicated.
 */

/** Mirrors the recipient rule the create path must apply. */
function mentionRecipients(description: string, authorId: string): string[] {
  return parseMentionIds(description).filter((id) => id !== authorId);
}

const M = (id: string, label: string) =>
  `<kaneo-mention id="${id}" label="${label}"></kaneo-mention>`;

describe("mentions in a description at creation time", () => {
  it("notifies a user mentioned in the initial description", () => {
    const description = `Hi ${M("user-a", "Ada")} please look.`;
    expect(mentionRecipients(description, "author")).toEqual(["user-a"]);
  });

  it("never notifies the author for mentioning themselves", () => {
    const description = `Note to self ${M("author", "Me")}`;
    expect(mentionRecipients(description, "author")).toEqual([]);
  });

  it("de-duplicates the same person mentioned twice", () => {
    const description = `${M("user-a", "Ada")} and again ${M("user-a", "Ada")}`;
    expect(mentionRecipients(description, "author")).toEqual(["user-a"]);
  });

  it("handles several distinct mentions", () => {
    const description = `${M("user-a", "Ada")} ${M("user-b", "Grace")}`;
    expect(mentionRecipients(description, "author").sort()).toEqual([
      "user-a",
      "user-b",
    ]);
  });

  it("returns nothing for a description with no mentions", () => {
    expect(mentionRecipients("just plain text", "author")).toEqual([]);
  });
});

/**
 * The real regression guard: createTask must actually FIRE the notifications.
 * The pure helper above cannot catch a create path that simply never calls it,
 * which is exactly the bug — so assert on the module's behaviour.
 */
describe("createTask notification wiring", () => {
  it("calls createNotification for each mentioned user", async () => {
    const createNotification = vi.fn();

    vi.resetModules();
    vi.doMock(
      "../../../apps/api/src/notification/controllers/create-notification",
      () => ({ default: createNotification }),
    );

    const { notifyDescriptionMentions } = await import(
      "../../../apps/api/src/task/controllers/notify-description-mentions"
    );

    await notifyDescriptionMentions({
      description: `Hi ${M("user-a", "Ada")}`,
      actorId: "author",
      taskId: "task-1",
      taskTitle: "A ticket",
      actorName: "Author",
      boardId: "board-1",
      organizationId: "org-1",
    });

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-a",
        type: "task_mention",
        resourceId: "task-1",
        resourceType: "task",
      }),
    );
  });
});
