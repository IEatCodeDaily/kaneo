#!/bin/bash
# kaneo.entelechia.cloud serves main. A systemd user timer on talos runs this
# every 5 minutes. When origin/main has moved and CI passed on the new commit,
# it builds a clean worktree of that commit, backs up the DB, and cuts the
# kaneo-dev-{api,web} units over to it, rolling back if the API is unhealthy.
# The result is posted as the `entelechia` commit status on the main commit.
#
# Install / update (on talos, from a checkout of main):
#   install -Dm755 deploy/entelechia/deploy-main.sh ~/.local/bin/kaneo-deploy-main
#   cp deploy/entelechia/kaneo-entelechia-deploy.{service,timer} ~/.config/systemd/user/
#   systemctl --user daemon-reload && systemctl --user enable --now kaneo-entelechia-deploy.timer
# Runtime env lives in ~/.config/kaneo-entelechia/ (api.env, web.env, web.env.production.local).
# Force a redeploy of the current main: rm ~/.local/state/kaneo-entelechia/*-sha
set -euo pipefail
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.1/installation/bin:/usr/local/bin:/usr/bin:/bin"

REPO=IEatCodeDaily/kaneo
GIT_DIR="$HOME/repos/kaneo"
TREES=("$HOME/worktrees/kfl387" "$HOME/worktrees/kfl387b")
ENV_DIR="$HOME/.config/kaneo-entelechia"
STATE="$HOME/.local/state/kaneo-entelechia"
BACKUP="$HOME/backups/kaneo-kfl386/pre-deploy.dump"
UNITS=(kaneo-dev-api kaneo-dev-web)
DROPIN=entelechia-worktree.conf
mkdir -p "$STATE"
exec 9>"$STATE/lock"
flock -n 9 || exit 0

git -C "$GIT_DIR" fetch -q origin main
SHA=$(git -C "$GIT_DIR" rev-parse origin/main)
[ "$SHA" = "$(cat "$STATE/deployed-sha" 2>/dev/null)" ] && exit 0
# A commit that failed to deploy is not retried until main moves again.
[ "$SHA" = "$(cat "$STATE/failed-sha" 2>/dev/null)" ] && exit 0

ci=$(gh run list -R "$REPO" --workflow ci.yml --commit "$SHA" --json status,conclusion \
  --jq '[.[] | select(.status == "completed")][0].conclusion // ""')
case "$ci" in
  success) ;;
  "") echo "waiting for CI on ${SHA:0:8}"; exit 0 ;;
  *) echo "CI $ci on ${SHA:0:8}, not deploying"; echo "$SHA" >"$STATE/failed-sha"; exit 0 ;;
esac

status() { # state description
  gh api -X POST "repos/$REPO/statuses/$SHA" -f state="$1" -f context=entelechia \
    -f target_url=https://kaneo.entelechia.cloud -f description="$2" >/dev/null || true
}
fail() {
  echo "FAILED: $1"
  echo "$SHA" >"$STATE/failed-sha"
  status failure "$1"
  exit 1
}
trap 'fail "deploy script error at line $LINENO"' ERR

LIVE=$(systemctl --user show kaneo-dev-api -p WorkingDirectory --value)
NEW=${TREES[0]}
[ "$LIVE" = "$NEW" ] && NEW=${TREES[1]}
echo "deploying ${SHA:0:8}: $LIVE -> $NEW"
status pending "deploying ${SHA:0:8}"

# Clean checkout of the exact commit: no mirrors, no overlays.
if [ -e "$NEW" ]; then git -C "$GIT_DIR" worktree remove --force "$NEW"; fi
git -C "$GIT_DIR" worktree prune
git -C "$GIT_DIR" worktree add -q --detach "$NEW" "$SHA"
install -m600 "$ENV_DIR/api.env" "$NEW/.env"
install -m600 "$ENV_DIR/web.env" "$NEW/apps/web/.env"
install -m600 "$ENV_DIR/web.env.production.local" "$NEW/apps/web/.env.production.local"

cd "$NEW"
corepack pnpm install --frozen-lockfile --prefer-offline --ignore-scripts >"$STATE/install.log" 2>&1 \
  || fail "pnpm install failed"
KANEO_VERSION="main-${SHA:0:8}" corepack pnpm build >"$STATE/build.log" 2>&1 \
  || fail "build failed"
grep -q '6 successful, 6 total' "$STATE/build.log" || fail "build incomplete"

# Backup before cutover: migrations run when the new API boots.
BACKUP="$BACKUP" node --input-type=module <<'JS' || fail "database backup failed"
import { config } from 'dotenv-mono';
import pg from './apps/api/node_modules/pg/lib/index.js';
import { spawnSync } from 'node:child_process';
import { chmodSync } from 'node:fs';
config();
const path = process.env.BACKUP;
const url = new URL(process.env.DATABASE_URL);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const major = Math.floor(Number((await c.query('SHOW server_version_num')).rows[0].server_version_num) / 10000);
await c.end();
const bin = `/usr/lib/postgresql/${major}/bin/`;
const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password), PGHOST: url.hostname,
  PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGDATABASE: url.pathname.slice(1) };
if (spawnSync(bin + 'pg_dump', ['--format=custom', '--no-owner', '--file', path], { env }).status !== 0) process.exit(1);
chmodSync(path, 0o600);
if (spawnSync(bin + 'pg_restore', ['--list', path], { stdio: 'ignore' }).status !== 0) process.exit(1);
console.log('backup verified', path);
JS

# This script is the only owner of the units' WorkingDirectory: drop-ins from
# older deploy schemes (sorting after ours would silently win) are retired.
point_units_at() {
  for u in "${UNITS[@]}"; do
    d="$HOME/.config/systemd/user/$u.service.d"
    for f in "$d"/*.conf; do
      [ "$(basename "$f")" = "$DROPIN" ] && continue
      if grep -q '^WorkingDirectory=' "$f"; then mv "$f" "$STATE/retired-$u-$(basename "$f")"; fi
    done
    printf '[Service]\nWorkingDirectory=%s\n' "$1" >"$d/$DROPIN"
  done
  systemctl --user daemon-reload
}
healthy() { # url
  for _ in $(seq 1 120); do
    curl -fsS --max-time 2 "$1" >/dev/null && return 0
    sleep 2
  done
  return 1
}
API=http://127.0.0.1:1337/api/health
WEB=http://127.0.0.1:5173/

point_units_at "$NEW"
systemctl --user restart kaneo-dev-api
if ! healthy "$API"; then
  point_units_at "$LIVE"
  systemctl --user restart "${UNITS[@]}"
  healthy "$API" || true
  fail "API unhealthy on ${SHA:0:8}; rolled back to $(basename "$LIVE")"
fi
systemctl --user restart kaneo-dev-web

for u in "${UNITS[@]}"; do
  [ "$(systemctl --user show "$u" -p WorkingDirectory --value)" = "$NEW" ] || fail "$u not on $NEW"
done
healthy "$WEB" || fail "web not serving after restart"
served=$(curl -fsS --max-time 10 "$WEB" | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1)
[ -f "$NEW/apps/web/dist/assets/$served" ] || fail "web serves $served, not the new build"

trap - ERR
echo "$SHA" >"$STATE/deployed-sha"
rm -f "$STATE/failed-sha"
status success "deployed ${SHA:0:8} ($served)"
echo "deployed ${SHA:0:8} from $NEW ($served)"
