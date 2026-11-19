ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "image" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_avatar" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" bytea NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_avatar_team_id_unique" UNIQUE("team_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_avatar" ADD CONSTRAINT "team_avatar_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_avatar_teamId_idx" ON "team_avatar" ("team_id");
