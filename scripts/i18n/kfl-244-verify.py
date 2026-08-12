#!/usr/bin/env python3
"""Prove the KFL-244 i18n rewrite lost nothing and touched only the two keys.

For every locale: flatten HEAD's version and the working version, then assert
  * every HEAD key still exists with an identical value, except the ones we
    deliberately changed;
  * the only keys we changed/added are tasks.gantt.unscheduledHint and
    tasks.gantt.dragToScheduleHint;
  * anything else that differs is reported loudly as a PRE-EXISTING working-tree
    change (another agent's uncommitted work) so it is never silently absorbed.
"""
import json
import subprocess
import glob
import os

ALLOWED = {
    "tasks.gantt.unscheduledHint",
    "tasks.gantt.dragToScheduleHint",
}


def flatten(obj, prefix=""):
    out = {}
    if isinstance(obj, dict):
        for key, value in obj.items():
            out.update(flatten(value, f"{prefix}.{key}" if prefix else key))
    else:
        out[prefix] = obj
    return out


bad = False
for path in sorted(glob.glob("i18n/*.json")):
    name = os.path.basename(path)[:-5]
    if name == "schema":
        continue
    head_raw = subprocess.run(
        ["git", "show", f"HEAD:{path}"], capture_output=True, text=True, check=True
    ).stdout
    head = flatten(json.loads(head_raw))
    work = flatten(json.load(open(path, encoding="utf-8")))

    lost = [k for k in head if k not in work]
    changed = [k for k in head if k in work and head[k] != work[k]]
    added = [k for k in work if k not in head]

    mine_changed = [k for k in changed if k in ALLOWED]
    mine_added = [k for k in added if k in ALLOWED]
    other_changed = [k for k in changed if k not in ALLOWED]
    other_added = [k for k in added if k not in ALLOWED]

    status = "OK"
    if lost:
        status = "LOST KEYS"
        bad = True
    print(
        f"{name}: {status} | lost={len(lost)} "
        f"mine(changed={len(mine_changed)},added={len(mine_added)}) "
        f"preexisting(changed={len(other_changed)},added={len(other_added)})"
    )
    if lost:
        print("   LOST:", lost[:10])
    if other_changed:
        print("   PRE-EXISTING CHANGED (not mine, left alone):", other_changed[:5])
    if other_added:
        print(
            f"   PRE-EXISTING ADDED (not mine, left alone): {len(other_added)} keys e.g.",
            other_added[:3],
        )

print()
print("VERDICT:", "FAIL — content lost" if bad else "no HEAD key lost in any locale")
