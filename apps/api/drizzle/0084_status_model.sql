-- Ticket status model (docs/plans/2026-11-14-ticket-status-model.md).
--
-- Every status becomes a typed `column` row on its board. Before this, Planned,
-- Triage and Duplicate were hardcoded "virtual" statuses with no row: Planned
-- tickets carried column_id NULL and none of them could be renamed, re-typed or
-- hidden. Labels do not change. Idempotent: every step guards on current state.

-- 1. Show-on-board flag (backlog types + Duplicate default to hidden).
ALTER TABLE "column" ADD COLUMN IF NOT EXISTS "show_on_board" boolean DEFAULT true NOT NULL;

-- 2. Type every existing row. Seeded slugs map 1:1; unknown custom slugs keep
--    their closed semantics (is_final -> completed, else started).
UPDATE "column" SET "status_type" = CASE "slug"
    WHEN 'triage' THEN 'triage'
    WHEN 'planned' THEN 'backlog'
    WHEN 'to-do' THEN 'unstarted'
    WHEN 'in-progress' THEN 'started'
    WHEN 'in-review' THEN 'started'
    WHEN 'done' THEN 'completed'
    WHEN 'canceled' THEN 'canceled'
    WHEN 'duplicate' THEN 'duplicate'
    ELSE CASE WHEN "is_final" THEN 'completed' ELSE 'started' END
  END
WHERE "status_type" IS NULL
   OR "status_type" NOT IN ('triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled', 'duplicate');

-- 3. Seed the statuses that used to be virtual (and Canceled, should 0083 have
--    missed a board). Name/slug are the frozen defaults.
INSERT INTO "column" ("id", "board_id", "name", "slug", "position", "is_final", "status_type", "show_on_board", "created_at", "updated_at")
SELECT
  'col_' || "seed"."slug" || '_' || "board"."id",
  "board"."id",
  "seed"."name",
  "seed"."slug",
  0,
  "seed"."is_final",
  "seed"."status_type",
  "seed"."show_on_board",
  NOW(),
  NOW()
FROM "board" "board"
CROSS JOIN (VALUES
  ('Triage', 'triage', 'triage', FALSE, FALSE),
  ('Planned', 'planned', 'backlog', FALSE, FALSE),
  ('Canceled', 'canceled', 'canceled', TRUE, TRUE),
  ('Duplicate', 'duplicate', 'duplicate', TRUE, FALSE)
) AS "seed"("name", "slug", "status_type", "is_final", "show_on_board")
WHERE NOT EXISTS (
  SELECT 1 FROM "column" "c" WHERE "c"."board_id" = "board"."id" AND "c"."slug" = "seed"."slug"
);

-- 4. Seeded hidden-by-default slugs that already existed as rows follow the
--    defaults too.
UPDATE "column" SET "show_on_board" = FALSE
WHERE "slug" IN ('triage', 'planned', 'duplicate') AND "show_on_board";

-- 5. Type is required and drives the closed flag.
UPDATE "column" SET "is_final" = ("status_type" IN ('completed', 'canceled', 'duplicate'))
WHERE "is_final" IS DISTINCT FROM ("status_type" IN ('completed', 'canceled', 'duplicate'));

ALTER TABLE "column" ALTER COLUMN "status_type" SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'column_status_type_check') THEN
    ALTER TABLE "column" ADD CONSTRAINT "column_status_type_check"
      CHECK ("status_type" IN ('triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled', 'duplicate'));
  END IF;
END $$;

-- 6. Positions become per type (order WITHIN a type group), preserving the
--    existing relative order.
UPDATE "column" "c" SET "position" = "ranked"."rn"
FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "board_id", "status_type" ORDER BY "position", "created_at", "id") - 1)::integer AS "rn"
  FROM "column"
) "ranked"
WHERE "c"."id" = "ranked"."id" AND "c"."position" IS DISTINCT FROM "ranked"."rn";

-- 7. One status per slug per board (task.status joins to its row by slug).
CREATE UNIQUE INDEX IF NOT EXISTS "column_board_slug_unique" ON "column" ("board_id", "slug");

-- 8. Every ticket points at its status row (Planned tickets had column_id NULL).
UPDATE "task" "t" SET "column_id" = "c"."id"
FROM "column" "c"
WHERE "c"."board_id" = "t"."board_id"
  AND "c"."slug" = "t"."status"
  AND "t"."column_id" IS DISTINCT FROM "c"."id";

-- board.task_status_order / backlog_status_order are superseded by row position
-- and no longer read. Left in place so an auto-rollback to the previous build
-- still finds them; drop in a later cleanup migration.
