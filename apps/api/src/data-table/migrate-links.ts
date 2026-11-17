import { asc, eq, sql } from "drizzle-orm";
import db from "../database";
import {
  dataTableActivityTable,
  dataTableFieldTable,
  dataTableTable,
} from "../database/schema";
import * as relations from "./relations";
import * as store from "./store";

/** Explicit operator action after a coordinated backup/restore rehearsal. Never run at API boot. */
export async function migrateLegacyLinks(userId: string, apply = false) {
  const fields = await db
    .select()
    .from(dataTableFieldTable)
    .where(eq(dataTableFieldTable.type, "link"));
  const report = [];
  for (const candidate of fields.filter(
    (field) => !field.options?.relationId,
  )) {
    const result = await db.transaction(async (tx) => {
      const targetId = candidate.options?.targetTableId;
      const problems: string[] = [];
      if (typeof targetId !== "string" || !/^[a-zA-Z0-9]+$/.test(targetId))
        return {
          fieldId: candidate.id,
          status: "blocked",
          problems: ["Invalid target table"],
          rows: 0,
          edges: 0,
        };
      const tables = await tx
        .select()
        .from(dataTableTable)
        .where(sql`${dataTableTable.id} IN (${candidate.tableId}, ${targetId})`)
        .orderBy(asc(dataTableTable.id))
        .for("update");
      const source = tables.find((table) => table.id === candidate.tableId);
      const target = tables.find((table) => table.id === targetId);
      if (!source || !target || source.organizationId !== target.organizationId)
        return {
          fieldId: candidate.id,
          status: "blocked",
          problems: ["Target is missing or belongs to another organization"],
          rows: 0,
          edges: 0,
        };
      const [field] = await tx
        .select()
        .from(dataTableFieldTable)
        .where(eq(dataTableFieldTable.id, candidate.id));
      if (!field || field.options?.relationId)
        return {
          fieldId: candidate.id,
          status: "already-migrated",
          problems: [],
          rows: 0,
          edges: 0,
        };
      if (field.options?.required)
        problems.push("Legacy required flag needs owner reconciliation");
      const raw = await tx.execute(
        sql`SELECT id, ${sql.identifier(store.column(field.id))} AS value, ${sql.identifier(store.column(field.id))}::text AS raw FROM ${relations.rowRef(source.id)} ORDER BY id`,
      );
      const targetRows = await tx.execute(
        sql`SELECT id FROM ${relations.rowRef(target.id)}`,
      );
      const targetIds = new Set(targetRows.rows.map((row) => String(row.id)));
      const edges: { source: string; target: string; position: number }[] = [];
      for (const row of raw.rows) {
        if (row.value == null) continue;
        if (
          !Array.isArray(row.value) ||
          row.value.some((id) => typeof id !== "string")
        ) {
          problems.push("Malformed legacy array");
          continue;
        }
        for (const [position, id] of [
          ...new Set(row.value as string[]),
        ].entries()) {
          if (!targetIds.has(id)) problems.push("Dangling target record");
          else if (source.id === target.id && row.id === id)
            problems.push("Self-edge needs reconciliation");
          else edges.push({ source: String(row.id), target: id, position });
        }
      }
      if (problems.length || !apply)
        return {
          fieldId: field.id,
          status: problems.length ? "blocked" : "ready",
          problems: [...new Set(problems)],
          rows: raw.rows.length,
          edges: edges.length,
        };
      const created = await relations.createRelation(
        tx,
        source.organizationId,
        source.id,
        {
          name: field.name,
          options: { targetTableId: target.id, cardinality: "many-to-many" },
        },
        userId,
        field,
      );
      for (const edge of edges)
        await tx.execute(
          sql`INSERT INTO ${relations.junctionRef(created.relation.id)} (source_row_id, target_row_id, position) VALUES (${edge.source}, ${edge.target}, ${edge.position})`,
        );
      const copied = await tx.execute(
        sql`SELECT source_row_id, target_row_id, position FROM ${relations.junctionRef(created.relation.id)} ORDER BY source_row_id, position`,
      );
      if (
        JSON.stringify(
          copied.rows.map((row) => [
            row.source_row_id,
            row.target_row_id,
            Number(row.position),
          ]),
        ) !==
        JSON.stringify(
          edges.map((edge) => [edge.source, edge.target, edge.position]),
        )
      )
        throw new Error("Legacy link verification failed");
      // Identity must continue after explicit legacy positions.
      await tx.execute(
        sql`SELECT setval(pg_get_serial_sequence(${`kaneo_tables.${relations.junction(created.relation.id)}`}, 'position'), ${Math.max(1, ...edges.map((edge) => edge.position + 1))}, false)`,
      );
      for (const table of [source, target])
        await tx.insert(dataTableActivityTable).values({
          tableId: table.id,
          userId,
          type: "links_migrated",
          data: {
            relationId: created.relation.id,
            originalField: field,
            rawRows: raw.rows,
            edgeCount: edges.length,
          },
        });
      return {
        fieldId: field.id,
        status: "migrated",
        problems: [],
        rows: raw.rows.length,
        edges: edges.length,
      };
    });
    report.push(result);
  }
  return report;
}
