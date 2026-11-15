-- Table activity log: who created / edited / deleted which row or field.
-- Row ids are physical kaneo_tables ids (no FK); the log outlives deleted rows.
CREATE TABLE IF NOT EXISTS "data_table_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"table_id" text NOT NULL REFERENCES "data_table"("id") ON DELETE CASCADE,
	"row_id" text,
	"user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
	"type" text NOT NULL,
	"field_id" text,
	"data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_table_activity_table_idx" ON "data_table_activity" ("table_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_table_activity_row_idx" ON "data_table_activity" ("table_id", "row_id", "created_at");
