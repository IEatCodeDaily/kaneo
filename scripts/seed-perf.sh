#!/usr/bin/env bash
# Heavy mock seed: 200+ tasks across 5 epics with 3-4 level subtask nesting
# plus blocks/related cross-links, to stress-test Gantt rendering performance.
set -euo pipefail

API=${API:-http://localhost:1337/api}
ORIGIN=${ORIGIN:-http://localhost:5173}
EMAIL=${EMAIL:-dev@local.test}
PASS=${PASS:-devpassword123}
JAR=$(mktemp)

j() { curl -s -m 15 -b "$JAR" -c "$JAR" -H 'content-type: application/json' -H "Origin: $ORIGIN" "$@"; }

j -X POST "$API/auth/sign-in/email" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" >/dev/null
ORG=$(j "$API/auth/organization/list" | jq -r '.[0].id')
j -X POST "$API/auth/organization/set-active" -d "{\"organizationId\":\"$ORG\"}" >/dev/null

BOARD=$(j -X POST "$API/board" -d "{\"name\":\"Perf Test\",\"organizationId\":\"$ORG\",\"icon\":\"Activity\",\"slug\":\"PERF\"}" | jq -r '.id')

# Collect task IDs for linking
> /tmp/perf-task-ids.txt

mk() { # title status prio start dur
  local s e
  s=$(date -u -d "+$3 days" +%Y-%m-%dT00:00:00.000Z)
  e=$(date -u -d "+$(($3 + $4)) days" +%Y-%m-%dT00:00:00.000Z)
  local id
  id=$(j -X POST "$API/task/$BOARD" -d "$(jq -nc --arg t "$1" --arg st "$2" --arg p "$4" --arg sd "$s" --arg dd "$e" \
    '{title:$t,description:"perf seed",status:$st,priority:"medium",startDate:$sd,dueDate:$dd}')" | jq -r '.id')
  echo "$id" >> /tmp/perf-task-ids.txt
  echo "$id"
}

sub() { j -X POST "$API/task-relation" -d "{\"sourceTaskId\":\"$1\",\"targetTaskId\":\"$2\",\"relationType\":\"subtask\"}" >/dev/null; }
blk() { j -X POST "$API/task-relation" -d "{\"sourceTaskId\":\"$1\",\"targetTaskId\":\"$2\",\"relationType\":\"blocks\"}" >/dev/null; }
rel() { j -X POST "$API/task-relation" -d "{\"sourceTaskId\":\"$1\",\"targetTaskId\":\"$2\",\"relationType\":\"related\"}" >/dev/null; }

# 5 epics, each with 3 features, each feature with 4-5 stories, some stories with 2-3 subtasks
# Total: 5 epics + 15 features + ~65 stories + ~110 subtasks ≈ 200 tasks

epic_count=0
for e in $(seq 1 5); do
  epic=$(mk "Epic $e: Platform Hardening" "in-progress" -2 60)
  epic_count=$((epic_count + 1))

  for f in $(seq 1 3); do
    feat=$(mk "Epic$e-Feature $f: Module $f" "to-do" $((e + f)) 40)
    sub "$epic" "$feat"
    epic_count=$((epic_count + 1))

    for s in $(seq 1 5); do
      so=$((e * 2 + f * 3 + s))
      sd=$((5 + RANDOM % 15))
      story=$(mk "Epic${e}F${f}S$s: Story $s" "to-do" "$so" "$sd")
      sub "$feat" "$story"
      epic_count=$((epic_count + 1))

      # Some stories get subtasks
      if [ $((s % 2)) -eq 0 ]; then
        for st in $(seq 1 3); do
          sto=$((e * 2 + f * 3 + s + st))
          std=$((2 + RANDOM % 6))
          subtask=$(mk "Epic${e}F${f}S${s}T$st: Subtask $st" "to-do" "$sto" "$std")
          sub "$story" "$subtask"
          epic_count=$((epic_count + 1))
        done
      fi
    done
  done
done

# Add blocks edges between adjacent epics and random related links
ids=($(cat /tmp/perf-task-ids.txt))
id_count=${#ids[@]}
echo "Created $epic_count tasks"

# blocks: epic[i] blocks epic[i+1] for sequential deps
for i in $(seq 0 4 $((id_count - 10))); do
  blk "${ids[$i]}" "${ids[$((i + 5))]}" 2>/dev/null || true
done

# related: scatter ~30 random links
for _ in $(seq 1 30); do
  a=$((RANDOM % id_count))
  b=$((RANDOM % id_count))
  [ "$a" != "$b" ] && rel "${ids[$a]}" "${ids[$b]}" 2>/dev/null || true
done

echo "board=$BOARD tasks=$epic_count"
echo "gantt: http://localhost:5173/dashboard/organization/$ORG/board/$BOARD/gantt"
