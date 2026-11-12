#!/bin/zsh
# Local replay of .github/workflows/{ci,ui-render}.yml on the MacBook while GitHub Actions is unavailable.
# usage: mac-ci.sh <git-ref> [steps...]   steps default: lint unit build web integration render
# Each step logs to ~/ci/receipts/<sha>/<step>.log; summary.txt has one line per step with exit code + seconds.
set -u
export PATH=/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH
export TZ=UTC  # GitHub runners are UTC; date tests assume it
REF=$1; shift
STEPS=(${@:-lint unit build web integration render})
cd ~/ci/kaneo
# one run at a time: runs share this checkout
until mkdir ~/ci/.lock 2>/dev/null; do sleep 5; done; trap 'rmdir ~/ci/.lock' EXIT
git fetch -q origin "$REF" && git checkout -q --detach FETCH_HEAD && git clean -qfdx -e node_modules -e '**/node_modules'
SHA=$(git rev-parse --short HEAD)
R=~/ci/receipts/$SHA; mkdir -p $R; : > $R/summary.txt
corepack enable pnpm >/dev/null 2>&1 || true
PG=kaneo-ci-pg

step() { local name=$1; shift; local t0=$SECONDS
  ( eval "$@" ) > $R/$name.log 2>&1; local rc=$?
  echo "$name rc=$rc $((SECONDS-t0))s" | tee -a $R/summary.txt; return 0; }

pg_up() {
  docker rm -f $PG >/dev/null 2>&1
  docker run -d --name $PG -e POSTGRES_DB=kaneo -e POSTGRES_USER=kaneo -e POSTGRES_PASSWORD=kaneo -p 55432:5432 postgres:16 >/dev/null
  for i in {1..40}; do docker exec $PG pg_isready -U kaneo -d kaneo >/dev/null 2>&1 && return 0; sleep 1; done; return 1; }

step install 'pnpm install --frozen-lockfile'
for s in $STEPS; do case $s in
  lint)  step lint 'pnpm exec biome ci .' ;;
  unit)  step unit 'pnpm build >/dev/null && pnpm --filter @kaneo/api test:coverage' ;;
  build) step build 'pnpm build' ;;
  size)  step size 'pnpm build >/dev/null 2>&1; ls -l apps/web/dist/assets/index-*.js | sort -k5 -n | tail -1' ;;
  web)   step web-types 'cd apps/web && pnpm exec tsc --noEmit -p tsconfig.app.json; echo "errors $(pnpm exec tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS")"'
         step web-unit 'cd apps/web && pnpm exec vitest run' ;;
  integration) step integration 'pg_up && NODE_ENV=test AUTH_SECRET=test-secret-with-at-least-32-chars DISABLE_GUEST_ACCESS=false \
      KANEO_API_URL=http://localhost:1337 KANEO_CLIENT_URL=http://localhost:5173 \
      DATABASE_URL=postgresql://kaneo:kaneo@localhost:55432/kaneo pnpm test:integration' ;;
  render)
    step pw 'pnpm exec playwright install chromium'
    step image 'docker build -q -f Dockerfile.kaneo -t kaneo:render .'
    step render 'pg_up && docker rm -f kaneo-render >/dev/null 2>&1; \
      docker run -d --name kaneo-render -p 55173:5173 \
        -e DATABASE_URL=postgresql://kaneo:kaneo@host.docker.internal:55432/kaneo \
        -e AUTH_SECRET=render-secret-with-at-least-32-characters \
        -e KANEO_API_URL=http://localhost:55173/api -e KANEO_CLIENT_URL=http://localhost:55173 kaneo:render >/dev/null && \
      BASE=http://localhost:55173 OUT=$HOME/ci/receipts/'$SHA'/shots node tests/ui-render/render.mjs; rc=$?; docker logs kaneo-render 2>&1 | tail -60 > '$R'/kaneo-container.log; exit $rc' ;;
esac; done
docker rm -f $PG kaneo-render >/dev/null 2>&1
echo "done $SHA" >> $R/summary.txt
