#!/usr/bin/env python3
"""Place the two unscheduled-hint keys next to their siblings in every locale.

Several locales never had `unscheduledHint`, so appending it left the pair at the
end of `tasks.gantt` instead of beside the related keys. Content is already
correct; this only normalises key order. Values are asserted unchanged.
"""
import collections
import glob
import json
import os

PAIR = ("unscheduledHint", "dragToScheduleHint")
# Preferred anchor, in order of preference.
ANCHORS = ("unscheduledGroup", "taskHeader")

root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
paths = sorted(glob.glob(os.path.join(root, "i18n", "*.json")))
if not paths:
    raise SystemExit("no locale files found — refusing to no-op silently")

touched = []
for path in paths:
    name = os.path.basename(path)[:-5]
    if name == "schema":
        continue
    data = json.load(open(path, encoding="utf-8"), object_pairs_hook=collections.OrderedDict)
    gantt = data.get("tasks", {}).get("gantt")
    if gantt is None or not all(k in gantt for k in PAIR):
        continue

    before = {k: gantt[k] for k in gantt}
    anchor = next((a for a in ANCHORS if a in gantt), None)
    if anchor is None:
        continue

    rebuilt = collections.OrderedDict()
    for key, value in gantt.items():
        if key in PAIR:
            continue
        rebuilt[key] = value
        if key == anchor:
            for pair_key in PAIR:
                rebuilt[pair_key] = gantt[pair_key]

    # Order-insensitive equality: no value may change, no key may vanish.
    assert dict(rebuilt) == dict(before), f"{name}: value drift while reordering"

    data["tasks"]["gantt"] = rebuilt
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(data, indent="\t", ensure_ascii=False) + "\n")
    touched.append(name)

print("reordered:", ", ".join(touched), f"({len(touched)})")
