ALTER TABLE "data_table" ADD COLUMN IF NOT EXISTS "form_slug" text;
--> statement-breakpoint
ALTER TABLE "data_table" ADD COLUMN IF NOT EXISTS "form_fields" jsonb;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "data_table_form_slug_idx" ON "data_table" ("form_slug") WHERE "form_slug" IS NOT NULL;
