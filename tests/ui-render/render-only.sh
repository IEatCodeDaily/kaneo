#!/bin/zsh
# Fast render loop on the current ~/ci/kaneo checkout (already built): fresh DB, API + preview, render.mjs.
# usage: render-only.sh <outdir>
set -u
export PATH=/opt/homebrew/opt/postgresql@16/bin:/opt/homebrew/bin:/usr/local/bin:$PATH TZ=UTC
OUT=$1; mkdir -p $OUT; cd ~/ci/kaneo
PGDATA=~/ci/pgdata; PGPORT=55432
pkill -f kaneo-ci-api; pkill -f "vite preview"; sleep 1
pg_ctl -D $PGDATA status >/dev/null 2>&1 || pg_ctl -D $PGDATA -o "-p $PGPORT -k /tmp" -l ~/ci/pg.log -w start >/dev/null
psql -q -h /tmp -p $PGPORT -U postgres -c "DROP DATABASE IF EXISTS kaneo WITH (FORCE)" \
  -c "DO \$\$BEGIN CREATE ROLE kaneo LOGIN SUPERUSER; EXCEPTION WHEN duplicate_object THEN NULL; END\$\$" -c "CREATE DATABASE kaneo OWNER kaneo"
(cd apps/api && exec -a kaneo-ci-api env DATABASE_URL=postgresql://kaneo@localhost:$PGPORT/kaneo AUTH_SECRET=render-secret-with-at-least-32-characters \
  KANEO_API_URL=http://localhost:5173/api KANEO_CLIENT_URL=http://localhost:5173 node dist/index.js > $OUT/api.log 2>&1 &)
(cd apps/web && pnpm exec vite preview --port 5173 --strictPort > $OUT/preview.log 2>&1 &)
BASE=http://localhost:5173 OUT=$OUT node tests/ui-render/render.mjs; rc=$?
pkill -f kaneo-ci-api; pkill -f "vite preview"
exit $rc
