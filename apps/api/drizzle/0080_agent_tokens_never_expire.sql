-- Agent tokens no longer expire; admins reissue or revoke them explicitly.
-- Text match, not a jsonb cast: one malformed metadata row must not fail boot.
UPDATE "apikey" SET "expires_at" = NULL WHERE "metadata" LIKE '%"type":"agent"%';
