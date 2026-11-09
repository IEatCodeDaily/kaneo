-- Per-organization switch for the Microsoft Teams integration. Default on so
-- organizations already using Teams keep their link previews.
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "teams_enabled" boolean DEFAULT true NOT NULL;
