import { migrateLegacyLinks } from "../src/data-table/migrate-links";
import { getDatabasePool } from "../src/database";

const args = process.argv.slice(2);
const actor = args.find((arg) => arg.startsWith("--actor="))?.slice(8);
if (
  !actor ||
  args.some((arg) => !arg.startsWith("--actor=") && arg !== "--apply")
)
  throw new Error(
    "Usage: pnpm exec tsx scripts/migrate-table-links.ts --actor=<existing-user-id> [--apply]. Apply only after a coordinated backup and restore rehearsal; stop old writers first.",
  );
try {
  const fields = await migrateLegacyLinks(actor, args.includes("--apply"));
  console.log(
    JSON.stringify(
      {
        fields,
        migrated: fields.filter((field) => field.status === "migrated").length,
        blocked: fields.filter((field) => field.status === "blocked").length,
        ready: fields.filter((field) => field.status === "ready").length,
      },
      null,
      2,
    ),
  );
  if (fields.some((field) => field.status === "blocked")) process.exitCode = 1;
} finally {
  await getDatabasePool().end();
}
