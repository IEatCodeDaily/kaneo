#!/usr/bin/env bash
# Dev seed: account + organization + board + dated tasks, so gantt/calendar views have data.
set -euo pipefail

API=${API:-http://localhost:1337/api}
ORIGIN=${ORIGIN:-http://localhost:5173}
EMAIL=${EMAIL:-dev@local.test}
PASS=${PASS:-devpassword123}
JAR=$(mktemp)

j() { curl -s -m 15 -b "$JAR" -c "$JAR" -H 'content-type: application/json' -H "Origin: $ORIGIN" "$@"; }

j -X POST "$API/auth/sign-up/email" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"Dev\"}" >/dev/null || true
j -X POST "$API/auth/sign-in/email" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" >/dev/null

ORG=$(j -X POST "$API/auth/organization/create" -d '{"name":"Dev Org","slug":"dev"}' | jq -r '.id')
[ "$ORG" = null ] && { echo "org create failed"; exit 1; }
j -X POST "$API/auth/organization/set-active" -d "{\"organizationId\":\"$ORG\"}" >/dev/null

BOARD=$(j -X POST "$API/board" -d "{\"name\":\"Roadmap\",\"organizationId\":\"$ORG\",\"icon\":\"Rocket\",\"slug\":\"ROAD\"}" | jq -r '.id')
[ "$BOARD" = null ] && { echo "board create failed"; exit 1; }

# title|status|priority|start offset days|duration days
while IFS='|' read -r title status prio off dur; do
  s=$(date -u -d "+$off days" +%Y-%m-%dT00:00:00.000Z)
  e=$(date -u -d "+$((off + dur)) days" +%Y-%m-%dT00:00:00.000Z)
  j -X POST "$API/task/$BOARD" -d "$(jq -nc --arg t "$title" --arg s "$status" --arg p "$prio" --arg sd "$s" --arg dd "$e" \
    '{title:$t,description:"seeded",status:$s,priority:$p,startDate:$sd,dueDate:$dd}')" >/dev/null
done <<'EOF'
Design discovery|to-do|high|-6|4
Schema migration|in-progress|urgent|-3|6
Auth rework|in-progress|medium|0|5
Gantt revamp|to-do|high|2|9
Calendar view|to-do|medium|4|7
Perf pass|planned|low|10|5
Docs refresh|to-do|low|12|3
Release cut|planned|urgent|18|2
EOF

echo "org=$ORG board=$BOARD"
echo "login: $EMAIL / $PASS"
echo "gantt: http://localhost:5173/dashboard/organization/$ORG/board/$BOARD/gantt"
