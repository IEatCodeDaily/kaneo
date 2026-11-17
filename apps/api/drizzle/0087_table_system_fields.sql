-- Physical row tables are intentionally outside Drizzle's generated schema.
DO $$
DECLARE
  physical_table record;
BEGIN
  FOR physical_table IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'kaneo_tables' AND table_type = 'BASE TABLE' AND table_name ~ '^t_[a-zA-Z0-9]+$'
  LOOP
    EXECUTE format('ALTER TABLE kaneo_tables.%I ADD COLUMN IF NOT EXISTS created_by text, ADD COLUMN IF NOT EXISTS updated_by text', physical_table.table_name);
    -- Missing activity is unknown, never attributed to the table owner.
    EXECUTE format($backfill$
      UPDATE kaneo_tables.%I AS target
      SET created_by = COALESCE(target.created_by, (
        SELECT user_id FROM data_table_activity
        WHERE table_id = $1 AND row_id = target.id AND type = 'row_created'
        ORDER BY created_at ASC, id ASC LIMIT 1
      )), updated_by = COALESCE(target.updated_by, (
        SELECT user_id FROM data_table_activity AS activity
        WHERE table_id = $1 AND (
          (row_id = target.id AND type IN ('row_created', 'cell_updated'))
          OR (type IN ('field_updated', 'field_reverted')
              AND data->>'fromType' IS DISTINCT FROM data->>'toType'
              AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(data->'afterColumn', '[]'::jsonb)) AS item WHERE item->>'id' = target.id))
        )
        ORDER BY created_at DESC, id DESC LIMIT 1
      ))
      WHERE target.created_by IS NULL OR target.updated_by IS NULL
    $backfill$, physical_table.table_name) USING substring(physical_table.table_name FROM 3);
  END LOOP;
END $$;
