ALTER TABLE "data_table_field" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_table_field_table_id_id_unique' AND conrelid = 'data_table_field'::regclass) THEN
    ALTER TABLE "data_table_field" ADD CONSTRAINT "data_table_field_table_id_id_unique" UNIQUE ("table_id", "id");
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_table_relation" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id"),
  "source_table_id" text NOT NULL,
  "target_table_id" text NOT NULL,
  "source_field_id" text NOT NULL UNIQUE,
  "target_field_id" text NOT NULL UNIQUE,
  "source_max" text NOT NULL CHECK ("source_max" IN ('one', 'many')),
  "target_max" text NOT NULL CHECK ("target_max" IN ('one', 'many')),
  "deleted_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CHECK ("source_field_id" <> "target_field_id"),
  FOREIGN KEY ("organization_id", "source_table_id") REFERENCES "data_table"("organization_id", "id"),
  FOREIGN KEY ("organization_id", "target_table_id") REFERENCES "data_table"("organization_id", "id"),
  FOREIGN KEY ("source_table_id", "source_field_id") REFERENCES "data_table_field"("table_id", "id"),
  FOREIGN KEY ("target_table_id", "target_field_id") REFERENCES "data_table_field"("table_id", "id")
);
--> statement-breakpoint
DO $$ DECLARE candidate record; BEGIN
  FOR candidate IN SELECT id FROM data_table LOOP
    IF candidate.id !~ '^[a-zA-Z0-9]+$' THEN RAISE EXCEPTION 'Invalid physical table identity'; END IF;
    IF to_regclass(format('kaneo_tables.%I', 't_' || candidate.id)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE kaneo_tables.%I ADD COLUMN IF NOT EXISTS deleted_at timestamptz', 't_' || candidate.id);
    END IF;
  END LOOP;
END $$;
