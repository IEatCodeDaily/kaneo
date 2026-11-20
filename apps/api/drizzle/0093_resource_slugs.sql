-- Resource slugs (#resource-slugs): repo / data_table / data_table_dashboard
-- gain a per-organization URL handle, backfilled from `name` with the same
-- normalization projects use (lowercase, non-alphanumeric runs -> '-', dash
-- trimmed, 63 chars). A name that normalizes to empty falls back to the row
-- id. Duplicates inside one organization get a -2, -3 … suffix in id order.
-- Hand-written (0092 pattern): every statement idempotent so the migration
-- can be replayed safely.

ALTER TABLE "repo" ADD COLUMN IF NOT EXISTS "slug" text;
--> statement-breakpoint
ALTER TABLE "data_table" ADD COLUMN IF NOT EXISTS "slug" text;
--> statement-breakpoint
ALTER TABLE "data_table_dashboard" ADD COLUMN IF NOT EXISTS "slug" text;
--> statement-breakpoint
UPDATE "repo" AS r
SET "slug" = s."slug"
FROM (
  SELECT
    t."id",
    CASE
      WHEN t."base" = '' THEN t."id"
      WHEN t."rn" = 1 THEN t."base"
      ELSE t."base" || '-' || t."rn"::text
    END AS "slug"
  FROM (
    SELECT
      x."id",
      x."organization_id",
      x."base",
      ROW_NUMBER() OVER (
        PARTITION BY x."organization_id", x."base"
        ORDER BY x."id"
      ) AS "rn"
    FROM (
      SELECT
        "id",
        "organization_id",
        btrim(left(btrim(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g')), 63), '-') AS "base"
      FROM "repo"
      WHERE "slug" IS NULL
    ) x
  ) t
) s
WHERE r."id" = s."id" AND r."slug" IS NULL;
--> statement-breakpoint
UPDATE "data_table" AS r
SET "slug" = s."slug"
FROM (
  SELECT
    t."id",
    CASE
      WHEN t."base" = '' THEN t."id"
      WHEN t."rn" = 1 THEN t."base"
      ELSE t."base" || '-' || t."rn"::text
    END AS "slug"
  FROM (
    SELECT
      x."id",
      x."organization_id",
      x."base",
      ROW_NUMBER() OVER (
        PARTITION BY x."organization_id", x."base"
        ORDER BY x."id"
      ) AS "rn"
    FROM (
      SELECT
        "id",
        "organization_id",
        btrim(left(btrim(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g')), 63), '-') AS "base"
      FROM "data_table"
      WHERE "slug" IS NULL
    ) x
  ) t
) s
WHERE r."id" = s."id" AND r."slug" IS NULL;
--> statement-breakpoint
UPDATE "data_table_dashboard" AS r
SET "slug" = s."slug"
FROM (
  SELECT
    t."id",
    CASE
      WHEN t."base" = '' THEN t."id"
      WHEN t."rn" = 1 THEN t."base"
      ELSE t."base" || '-' || t."rn"::text
    END AS "slug"
  FROM (
    SELECT
      x."id",
      x."organization_id",
      x."base",
      ROW_NUMBER() OVER (
        PARTITION BY x."organization_id", x."base"
        ORDER BY x."id"
      ) AS "rn"
    FROM (
      SELECT
        "id",
        "organization_id",
        btrim(left(btrim(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g')), 63), '-') AS "base"
      FROM "data_table_dashboard"
      WHERE "slug" IS NULL
    ) x
  ) t
) s
WHERE r."id" = s."id" AND r."slug" IS NULL;
--> statement-breakpoint
ALTER TABLE "repo" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "data_table" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "data_table_dashboard" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "repo_organization_slug_lower_unique"
  ON "repo" ("organization_id", lower("slug"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "data_table_organization_slug_lower_unique"
  ON "data_table" ("organization_id", lower("slug"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "data_table_dashboard_organization_slug_lower_unique"
  ON "data_table_dashboard" ("organization_id", lower("slug"));
