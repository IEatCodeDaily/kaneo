-- 2026-11 status TYPES (owner direction):
--   Backlog, Triage, Unstarted, Started, Completed, Canceled, Duplicate
--
-- Status LABELS do not change. This migration only:
--   1. adds column.status_type (the classification picked in Status settings),
--   2. backfills existing final columns as "completed" (they were done columns),
--   3. gives every board an explicit Canceled lane (closed, like Done).

ALTER TABLE "column" ADD COLUMN IF NOT EXISTS "status_type" text;

-- Existing final columns were "done columns" — their type is completed.
UPDATE "column" SET "status_type" = 'completed'
WHERE "is_final" AND "status_type" IS NULL;

-- Explicit Canceled lane on every board that does not have one yet.
-- is_final = true so due-date reminders and My Tasks treat it as closed.
INSERT INTO "column" ("id", "board_id", "name", "slug", "position", "is_final", "status_type", "created_at", "updated_at")
SELECT
  'col_canceled_' || "board"."id",
  "board"."id",
  'Canceled',
  'canceled',
  COALESCE((
    SELECT MAX("c"."position") + 1 FROM "column" "c" WHERE "c"."board_id" = "board"."id"
  ), 0),
  TRUE,
  'canceled',
  NOW(),
  NOW()
FROM "board" "board"
WHERE NOT EXISTS (
  SELECT 1 FROM "column" "c" WHERE "c"."board_id" = "board"."id" AND "c"."slug" = 'canceled'
);
