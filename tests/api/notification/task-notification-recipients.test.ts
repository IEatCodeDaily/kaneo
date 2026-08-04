import { describe, expect, it } from "vitest";
import {
  getAssignmentNotificationRecipientIds,
  mergeTaskNotificationRecipientIds,
} from "../../../apps/api/src/notification/task-notification-recipients";

describe("task notification recipients", () => {
  it("includes creators, participants, assignee, and direct targets", () => {
    expect(
      mergeTaskNotificationRecipientIds({
        actorId: "actor",
        assigneeId: "assignee",
        participantIds: ["creator", "participant"],
        directUserIds: ["target"],
      }).sort(),
    ).toEqual(["assignee", "creator", "participant", "target"]);
  });

  it("excludes the actor and deduplicates overlapping relationships", () => {
    expect(
      mergeTaskNotificationRecipientIds({
        actorId: "actor",
        assigneeId: "creator",
        participantIds: ["actor", "creator", "participant", null],
        directUserIds: ["creator", "participant", undefined],
      }).sort(),
    ).toEqual(["creator", "participant"]);
  });

  it("notifies only the new assignee when another user assigns them", () => {
    expect(
      getAssignmentNotificationRecipientIds({
        actorId: "manager",
        newAssigneeId: "alice",
      }),
    ).toEqual(["alice"]);
  });

  it("notifies nobody when a user assigns the ticket to themselves", () => {
    expect(
      getAssignmentNotificationRecipientIds({
        actorId: "alice",
        newAssigneeId: "alice",
      }),
    ).toEqual([]);
  });

  it("does not leak self-assignment notifications to historical participants", () => {
    expect(
      mergeTaskNotificationRecipientIds({
        actorId: "alice",
        assigneeId: "alice",
        participantIds: ["talos"],
        directUserIds: ["alice"],
      }),
    ).toEqual(["talos"]);
    expect(
      getAssignmentNotificationRecipientIds({
        actorId: "alice",
        newAssigneeId: "alice",
      }),
    ).not.toContain("talos");
  });
});
