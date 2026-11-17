-- Keep migrations deployable on managed Postgres without extension privileges.
-- The same callable predicate is installed in both modes; no missing-function
-- error can turn search into a 500 when pg_trgm is unavailable.
CREATE OR REPLACE FUNCTION kaneo_search_typo(document text, query text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT false $$;
--> statement-breakpoint
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION WHEN insufficient_privilege OR undefined_file OR feature_not_supported THEN
    RAISE NOTICE 'pg_trgm unavailable: Kaneo search uses full-text search only';
  END;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE OR REPLACE FUNCTION kaneo_search_typo(document text, query text)
      RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$ SELECT document %> query $fn$';
    EXECUTE 'CREATE INDEX IF NOT EXISTS task_search_trgm_idx ON task USING gin ((coalesce(title, '''') || '' '' || coalesce(description, '''')) gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS board_search_trgm_idx ON board USING gin ((coalesce(name, '''') || '' '' || coalesce(description, '''')) gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS organization_search_trgm_idx ON organization USING gin ((coalesce(name, '''') || '' '' || coalesce(description, '''')) gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS repo_search_trgm_idx ON repo USING gin ((coalesce(name, '''') || '' '' || coalesce(owner, '''') || '' '' || coalesce(description, '''')) gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS repo_issue_search_trgm_idx ON repo_issue USING gin ((coalesce(title, '''') || '' '' || coalesce(body, '''')) gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS repo_pr_search_trgm_idx ON repo_pull_request USING gin ((coalesce(title, '''') || '' '' || coalesce(body, '''')) gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS activity_search_trgm_idx ON activity USING gin ((coalesce(content, '''')) gin_trgm_ops)';
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS task_search_fts_idx ON task USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '')));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS board_search_fts_idx ON board USING gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '')));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS organization_search_fts_idx ON organization USING gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '')));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS repo_search_fts_idx ON repo USING gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(owner, '') || ' ' || coalesce(description, '')));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS repo_issue_search_fts_idx ON repo_issue USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, '')));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS repo_pr_search_fts_idx ON repo_pull_request USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, '')));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS activity_search_fts_idx ON activity USING gin (to_tsvector('simple', coalesce(content, '')));
