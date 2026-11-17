CREATE TABLE IF NOT EXISTS "data_table_view" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL,
  "table_id" text NOT NULL,
  "name" text NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "config" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "data_table_view_parent_fk" FOREIGN KEY ("organization_id", "table_id")
    REFERENCES "data_table" ("organization_id", "id") ON DELETE CASCADE,
  CONSTRAINT "data_table_view_name_check" CHECK (length(btrim("name")) BETWEEN 1 AND 100),
  CONSTRAINT "data_table_view_config_size_check" CHECK (octet_length("config"::text) <= 262144)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "data_table_view_default_idx" ON "data_table_view" ("table_id") WHERE "is_default";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_table_view_table_idx" ON "data_table_view" ("organization_id", "table_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kaneo_create_default_table_view() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO data_table_view (id, organization_id, table_id, name, is_default)
    VALUES ('grid_' || NEW.id, NEW.organization_id, NEW.id, 'Default', true)
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS data_table_default_view ON data_table;
CREATE TRIGGER data_table_default_view AFTER INSERT ON data_table
  FOR EACH ROW EXECUTE FUNCTION kaneo_create_default_table_view();
--> statement-breakpoint
INSERT INTO data_table_view (id, organization_id, table_id, name, is_default)
  SELECT 'grid_' || id, organization_id, id, 'Default', true FROM data_table t
  WHERE NOT EXISTS (SELECT 1 FROM data_table_view v WHERE v.table_id = t.id AND v.is_default)
  ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kaneo_require_default_table_view() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id text;
BEGIN
  parent_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.table_id ELSE NEW.table_id END;
  IF EXISTS (SELECT 1 FROM data_table WHERE id = parent_id) AND
     (SELECT count(*) FROM data_table_view WHERE table_id = parent_id AND is_default) <> 1 THEN
    RAISE EXCEPTION 'A table must have exactly one default view' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS data_table_view_require_default ON data_table_view;
CREATE CONSTRAINT TRIGGER data_table_view_require_default AFTER INSERT OR UPDATE OR DELETE ON data_table_view
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION kaneo_require_default_table_view();
