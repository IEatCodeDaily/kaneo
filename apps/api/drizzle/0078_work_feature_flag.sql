ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "work_enabled" boolean DEFAULT false NOT NULL;
