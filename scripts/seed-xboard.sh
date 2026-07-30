#!/usr/bin/env bash
# Seeds the cross-board relation scenario from the spec across three boards,
# so BoardB's Gantt can be verified: TaskB1/TaskB2 get TaskA1 as their single
# foreign parent, TaskA1's other children (TaskA2, TaskC1) must NOT appear.
set -euo pipefail

API=${API:-http://localhost:1337/api}
ORIGIN=${ORIGIN:-http://localhost:5173}
EMAIL=${EMAIL:-dev@local.test}
PASS=${PASS:-devpassword123}
JAR=$(mktemp)

j() { curl -s -m 15 -b "$JAR" -c "$JAR" -H 'content-type: application/json' -H "Origin: $ORIGIN" "$@"; }

j -X POST "$API/auth/sign-in/email" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" >/dev/null
ORG=$(j "$API/auth/organization/list" | jq -r '.[0].id')
[ "$ORG" = null ] && { echo "no organization; run seed-dev.sh first"; exit 1; }
j -X POST "$API/auth/organization/set-active" -d "{\"organizationId\":\"$ORG\"}" >/dev/null

mkboard() {
  j -X POST "$API/board" \
    -d "{\"name\":\"$1\",\"organizationId\":\"$ORG\",\"icon\":\"Rocket\",\"slug\":\"$2\"}" | jq -r '.id'
}

# title|board|start offset|duration
mktask() {
  local s e
  s=$(date -u -d "+$3 days" +%Y-%m-%dT00:00:00.000Z)
  e=$(date -u -d "+$(($3 + $4)) days" +%Y-%m-%dT00:00:00.000Z)
  j -X POST "$API/task/$2" -d "$(jq -nc --arg t "$1" --arg sd "$s" --arg dd "$e" \
    '{title:$t,description:"xboard seed",status:"to-do",priority:"medium",startDate:$sd,dueDate:$dd}')" | jq -r '.id'
}

link() { # parent child
  j -X POST "$API/task-relation" \
    -d "{\"sourceTaskId\":\"$1\",\"targetTaskId\":\"$2\",\"relationType\":\"subtask\"}" >/dev/null
}

BA=$(mkboard "Board A" "XBA")
BB=$(mkboard "Board B" "XBB")
BC=$(mkboard "Board C" "XBC")

A1=$(mktask "TaskA1" "$BA" -4 6)
A2=$(mktask "TaskA2" "$BA" -2 3)
B1=$(mktask "TaskB1" "$BB" 0 5)
B2=$(mktask "TaskB2" "$BB" 2 4)
B3=$(mktask "TaskB3" "$BB" 3 3)
B4=$(mktask "TaskB4" "$BB" 5 3)
C1=$(mktask "TaskC1" "$BC" 1 4)
C2=$(mktask "TaskC2" "$BC" 6 3)

# TaskA1 subtasks: A2, B1, B2, C1
for child in "$A2" "$B1" "$B2" "$C1"; do link "$A1" "$child"; done
# TaskB1 subtasks: B3, B4, C2
for child in "$B3" "$B4" "$C2"; do link "$B1" "$child"; done

echo "boardB=$BB"
echo "expect visible on BoardB: TaskA1(foreign parent), TaskB1, TaskB2, TaskB3, TaskB4, TaskC2(foreign child)"
echo "expect hidden on BoardB:  TaskA2, TaskC1"
echo "gantt: http://localhost:5173/dashboard/organization/$ORG/board/$BB/gantt"
