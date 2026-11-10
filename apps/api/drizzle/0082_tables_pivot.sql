-- Tables pivot (docs/table-feature-discovery.md §9): typed physical row tables
-- in schema kaneo_tables replace the EAV pair. Row storage moves out of
-- drizzle-managed public tables; the DDL ledger records every runtime statement.
-- The feature is flag-gated alpha — existing EAV rows are discarded, not migrated.
CREATE SCHEMA IF NOT EXISTS kaneo_tables;
--> statement-breakpoint
ALTER TABLE "data_table" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
--> statement-breakpoint
ALTER TABLE "data_table_field" ADD COLUMN IF NOT EXISTS "options" jsonb;
--> statement-breakpoint
ALTER TABLE "data_table_field" DROP CONSTRAINT IF EXISTS "data_table_field_type_check";
--> statement-breakpoint
DROP TABLE IF EXISTS "data_table_cell" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "data_table_row" CASCADE;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_table_dashboard" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"panels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS: concurrent migrators (vitest
-- workers) raced this FK and the loser got 42710. Guard via pg_constraint,
-- and serialize check-then-act between migrators. The key must differ from
-- the test helper's migration lock (727411) — that lock is held while
-- migrations run, so reusing it here would self-deadlock every integration
-- run.
DO $$
BEGIN
  PERFORM pg_advisory_xact_lock(821082);
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'data_table_dashboard_organization_id_organization_id_fk'
      AND conrelid = '"public"."data_table_dashboard"'::regclass
  ) THEN
    ALTER TABLE "data_table_dashboard" ADD CONSTRAINT "data_table_dashboard_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_table_dashboard_organization_idx" ON "data_table_dashboard" USING btree ("organization_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_table_ddl_log" (
	"id" text PRIMARY KEY NOT NULL,
	"data_table_id" text NOT NULL,
	"statement" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_table_ddl_log_table_idx" ON "data_table_ddl_log" USING btree ("data_table_id");
