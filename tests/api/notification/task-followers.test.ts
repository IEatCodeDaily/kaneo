import { describe, expect, it } from "vitest";
import { mergeTaskNotificationRecipientIds } from "../../../apps/api/src/notification/task-notification-recipients";

/**
 * KFL-339: following a ticket.
 *
 * A follower has an explicit, durable interest in a ticket even when they are
 * neither the assignee nor an activity participant. Merging must therefore
 * treat followers as a first-class recipient source, while keeping the two
 * existing invariants: the actor never notifies themselves, and recipients are
 * de-duplicated.
 */
describe("mergeTaskNotificationRecipientIds — followers (KFL-339)", () => {
  it("notifies a follower who is neither assignee nor participant", () => {
    const recipients = mergeTaskNotificationRecipientIds({
      actorId: "actor",
      assigneeId: null,
      participantIds: [],
      directUserIds: [],
      followerIds: ["follower-1"],
    });

    expect(recipients).toContain("follower-1");
  });

  it("still excludes the actor even when they follow the ticket", () => {
    const recipients = mergeTaskNotificationRecipientIds({
      actorId: "actor",
      assigneeId: null,
      participantIds: [],
      directUserIds: [],
      followerIds: ["actor", "follower-1"],
    });

    expect(recipients).not.toContain("actor");
    expect(recipients).toContain("follower-1");
  });

  it("de-duplicates a follower who is also the assignee", () => {
    const recipients = mergeTaskNotificationRecipientIds({
      actorId: "actor",
      assigneeId: "alice",
      participantIds: ["alice"],
      directUserIds: [],
      followerIds: ["alice"],
    });

    expect(recipients.filter((id) => id === "alice")).toHaveLength(1);
  });

  it("keeps working when followerIds is omitted (back-compat)", () => {
    const recipients = mergeTaskNotificationRecipientIds({
      actorId: "actor",
      assigneeId: "alice",
      participantIds: ["bob"],
      directUserIds: [],
    });

    expect(recipients.sort()).toEqual(["alice", "bob"]);
  });
});
