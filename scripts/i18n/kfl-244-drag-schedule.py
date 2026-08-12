#!/usr/bin/env python3
"""KFL-244: add tasks.gantt.dragToScheduleHint and update unscheduledHint.

The unscheduled row is now draggable, so its hint text ("click to schedule")
under-describes the affordance. Writes every locale with the repo's exact
formatting (tab indent, trailing newline) and asserts a byte-exact roundtrip on
untouched content before saving.
"""
import glob
import json
import os
import collections

# unscheduledHint: keep it short (it renders inside a chip in a 30px row).
# dragToScheduleHint: the tooltip on the draggable track.
NEW = {
    "en-US": ("No dates - drag to schedule", "Drag across the timeline to schedule this ticket"),
    "de-DE": ("Keine Daten – zum Planen ziehen", "Zieh über die Zeitleiste, um dieses Ticket zu planen"),
    "el-GR": ("Χωρίς ημερομηνίες - σύρετε για προγραμματισμό", "Σύρετε κατά μήκος του χρονοδιαγράμματος για να προγραμματίσετε αυτό το αίτημα"),
    "es-ES": ("Sin fechas: arrastra para programar", "Arrastra por la línea de tiempo para programar este ticket"),
    "fr-FR": ("Aucune date - faites glisser pour planifier", "Faites glisser sur la chronologie pour planifier ce ticket"),
    "id-ID": ("Tanpa tanggal - geser untuk menjadwalkan", "Geser di sepanjang timeline untuk menjadwalkan tiket ini"),
    "ko-KR": ("날짜 없음 - 드래그하여 일정 지정", "타임라인에서 드래그하여 이 티켓의 일정을 지정하세요"),
    "mk-MK": ("Без датуми - влечете за распоред", "Влечете по временската линија за да го распоредите овој тикет"),
    "nl-NL": ("Geen datums - sleep om te plannen", "Sleep over de tijdlijn om dit ticket te plannen"),
    "ru-RU": ("Нет дат — перетащите, чтобы запланировать", "Перетащите по шкале времени, чтобы запланировать эту задачу"),
    "tr-TR": ("Tarih yok - planlamak için sürükleyin", "Bu talebi planlamak için zaman çizelgesinde sürükleyin"),
    "uk-UA": ("Немає дат — перетягніть, щоб запланувати", "Перетягніть шкалою часу, щоб запланувати це завдання"),
}

# Repo root is two levels up from scripts/i18n/.
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
paths = sorted(glob.glob(os.path.join(root, "i18n", "*.json")))
if not paths:
    raise SystemExit(f"no locale files found under {root}/i18n — refusing to no-op silently")
changed = []

for path in paths:
    name = os.path.basename(path)[:-5]
    if name == "schema":
        continue
    with open(path, "r", encoding="utf-8") as fh:
        raw = fh.read()

    data = json.loads(raw, object_pairs_hook=collections.OrderedDict)

    # Roundtrip guard BEFORE mutating: if our serializer can't reproduce the
    # file byte-for-byte, we must not rewrite it.
    rt = json.dumps(data, indent="\t", ensure_ascii=False) + "\n"
    if rt != raw:
        raise SystemExit(
            f"{name}: serializer does not roundtrip this file byte-exactly; refusing to write.\n"
            f"  original {len(raw)} bytes vs roundtrip {len(rt)} bytes"
        )

    gantt = data.get("tasks", {}).get("gantt")
    if gantt is None:
        print(f"{name}: no tasks.gantt block, skipping")
        continue

    hint, tooltip = NEW.get(name, NEW["en-US"])
    gantt["unscheduledHint"] = hint
    # Insert the new key right after unscheduledHint to keep related keys together.
    if "dragToScheduleHint" not in gantt:
        rebuilt = collections.OrderedDict()
        for key, value in gantt.items():
            rebuilt[key] = value
            if key == "unscheduledHint":
                rebuilt["dragToScheduleHint"] = tooltip
        data["tasks"]["gantt"] = rebuilt
    else:
        gantt["dragToScheduleHint"] = tooltip

    out = json.dumps(data, indent="\t", ensure_ascii=False) + "\n"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(out)

    # Verify what we wrote parses and contains both keys.
    check = json.load(open(path, encoding="utf-8"))["tasks"]["gantt"]
    assert check["dragToScheduleHint"] == tooltip, name
    assert check["unscheduledHint"] == hint, name
    changed.append(name)

print("updated locales:", ", ".join(changed))
print("count:", len(changed))
