import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createBoardFixture,
  createOrganizationMember,
} from "./helpers/fixtures";

/**
 * Ticket status model invariants (docs/plans/2026-11-14-ticket-status-model.md):
 * every board keeps ≥1 status per type, type is required, and reordering never
 * changes a status's type.
 */
describe("API integration: board statuses", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  async function setup() {
    // Status settings need board:update — an org admin, not a plain member.
    const member = await createOrganizationMember({ role: "admin" });
    const fixture = await createBoardFixture({
      organizationId: member.organization.id,
    });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const json = (method: string, path: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    return { ...fixture, json };
  }

  it("refuses to delete or re-type the last status of a type", async () => {
    const { columns, json } = await setup();

    const del = await json("DELETE", `/api/column/${columns.duplicate.id}`);
    expect(del.status).toBe(409);

    const retype = await json("PUT", `/api/column/${columns.planned.id}`, {
      statusType: "started",
    });
    expect(retype.status).toBe(409);

    // In Progress is NOT the last started status (In Review is too).
    const ok = await json("PUT", `/api/column/${columns.inReview.id}`, {
      statusType: "completed",
    });
    expect(ok.status).toBe(200);
    const updated = (await ok.json()) as {
      statusType: string;
      isFinal: boolean;
    };
    expect(updated).toMatchObject({ statusType: "completed", isFinal: true });
  });

  it("requires a type for custom statuses and adds them as board rows", async () => {
    const { board, json } = await setup();

    const untyped = await json("POST", `/api/column/${board.id}`, {
      name: "Icebox",
    });
    expect(untyped.status).toBe(400);

    const created = await json("POST", `/api/column/${board.id}`, {
      name: "Icebox",
      statusType: "backlog",
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      slug: "icebox",
      statusType: "backlog",
      isFinal: false,
      showOnBoard: false,
      position: 1,
    });

    // A ticket can now be set to the custom status.
    const task = await json("POST", `/api/task/${board.id}`, {
      title: "Parked idea",
      description: "",
      status: "icebox",
      priority: "low",
    });
    expect(task.status).toBe(200);
  });

  it("only reorders within one type", async () => {
    const { board, columns, json } = await setup();

    const mixed = await json("PUT", `/api/column/reorder/${board.id}`, {
      columns: [
        { id: columns.todo.id, position: 1 },
        { id: columns.done.id, position: 0 },
      ],
    });
    expect(mixed.status).toBe(400);

    const sameType = await json("PUT", `/api/column/reorder/${board.id}`, {
      columns: [
        { id: columns.inReview.id, position: 0 },
        { id: columns.inProgress.id, position: 1 },
      ],
    });
    expect(sameType.status).toBe(200);
    const ordered = (await sameType.json()) as { slug: string }[];
    expect(ordered.map((column) => column.slug)).toEqual([
      "triage",
      "planned",
      "to-do",
      "in-review",
      "in-progress",
      "done",
      "canceled",
      "duplicate",
    ]);
  });
});
