#!/bin/zsh
# Local replay of .github/workflows/{ci,ui-render}.yml on the MacBook while GitHub Actions is unavailable.
# usage: mac-ci.sh <git-ref> [steps...]   steps default: lint unit build web integration render
# Postgres 16 runs natively (Homebrew), not in Docker. Render serves the production build with
# `vite preview` + the built API (dist/index.js) instead of the docker image.
# Logs: ~/ci/receipts/<sha>/<step>.log; summary.txt has one line per step with exit code + seconds.
set -u
export PATH=/opt/homebrew/opt/postgresql@16/bin:/opt/homebrew/bin:/usr/local/bin:$PATH
export TZ=UTC  # GitHub runners are UTC; date tests assume it
REF=$1; shift
STEPS=(${@:-lint unit build web integration render})
(( $# )) || STEPS=(lint unit build web integration render)
cd ~/ci/kaneo
# one run at a time: runs share this checkout
until mkdir ~/ci/.lock 2>/dev/null; do sleep 5; done
PGDATA=~/ci/pgdata; PGPORT=55432
cleanup() { pkill -f kaneo-ci-api 2>/dev/null; pkill -f "vite preview" 2>/dev/null; pg_ctl -D $PGDATA -m fast stop >/dev/null 2>&1; rmdir ~/ci/.lock; }
trap cleanup EXIT
git reset -q --hard && git fetch -q origin "$REF" && git checkout -q --detach FETCH_HEAD && git clean -qfdx -e node_modules -e '**/node_modules'
# HARNESS=<ref>: overlay tests/ui-render from another ref, to render "before" screens of a ref that predates the harness
[[ -n ${HARNESS:-} ]] && git fetch -q origin "$HARNESS" && git checkout -q FETCH_HEAD -- tests/ui-render
SHA=$(git rev-parse --short HEAD)
R=~/ci/receipts/$SHA; mkdir -p $R; : > $R/summary.txt
corepack enable pnpm >/dev/null 2>&1 || true

step() { local name=$1; shift; local t0=$SECONDS
  ( eval "$@" ) > $R/$name.log 2>&1; local rc=$?
  echo "$name rc=$rc $((SECONDS-t0))s" | tee -a $R/summary.txt; return 0; }

# fresh database per call: drop + recreate keeps runs independent
pg_up() { local db=$1 user=$2
  [[ -d $PGDATA ]] || initdb -U postgres -A trust -D $PGDATA >/dev/null
  pg_ctl -D $PGDATA status >/dev/null 2>&1 || pg_ctl -D $PGDATA -o "-p $PGPORT -k /tmp" -l ~/ci/pg.log -w start >/dev/null
  psql -q -h /tmp -p $PGPORT -U postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE)" \
    -c "DO \$\$BEGIN CREATE ROLE $user LOGIN SUPERUSER; EXCEPTION WHEN duplicate_object THEN NULL; END\$\$" \
    -c "CREATE DATABASE $db OWNER $user"; }

step install 'pnpm install --frozen-lockfile'
for s in $STEPS; do case $s in
  lint)  step lint 'pnpm exec biome ci .' ;;
  unit)  step unit 'pnpm build >/dev/null && pnpm --filter @kaneo/api test:coverage' ;;
  build) step build 'pnpm build' ;;
  size)  step size 'pnpm build >/dev/null 2>&1; ls -l apps/web/dist/assets/index-*.js | sort -k5 -n | tail -1' ;;
  web)   step web-types 'pnpm build >/dev/null 2>&1; cd apps/web && pnpm exec tsc --noEmit -p tsconfig.app.json; rc=$?; echo "errors $(pnpm exec tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS")"; exit $rc'
         step web-unit 'cd apps/web && pnpm exec vitest run' ;;
  integration) step integration 'pg_up kaneo_test postgres && NODE_ENV=test AUTH_SECRET=test-secret-with-at-least-32-chars DISABLE_GUEST_ACCESS=false \
      KANEO_API_URL=http://localhost:1337 KANEO_CLIENT_URL=http://localhost:5173 \
      DATABASE_URL=postgresql://postgres@localhost:$PGPORT/kaneo_test pnpm test:integration' ;;
  render)
    step pw 'pnpm exec playwright install chromium'
    # prod build bakes KANEO_API_URL placeholders (the docker entrypoint swaps them); set real URLs instead
    step render-build 'VITE_API_URL=/api VITE_CLIENT_URL=http://localhost:5173 pnpm build'
    step render 'pg_up kaneo kaneo && cd apps/api && \
      (exec -a kaneo-ci-api env DATABASE_URL=postgresql://kaneo@localhost:$PGPORT/kaneo AUTH_SECRET=render-secret-with-at-least-32-characters \
        KANEO_API_URL=http://localhost:5173/api KANEO_CLIENT_URL=http://localhost:5173 node dist/index.js > $R/api.log 2>&1 &) && \
      cd ../web && (pnpm exec vite preview --port 5173 --strictPort > $R/preview.log 2>&1 &) && cd ../.. && \
      BASE=http://localhost:5173 OUT=$R/shots node tests/ui-render/render.mjs' ;;
esac; done
echo "done $SHA" >> $R/summary.txt
