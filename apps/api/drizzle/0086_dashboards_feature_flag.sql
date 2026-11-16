ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "dashboards_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Dashboards used to ride the Tables flag; keep them visible where they were.
UPDATE "organization" SET "dashboards_enabled" = true WHERE "tables_enabled" = true;
