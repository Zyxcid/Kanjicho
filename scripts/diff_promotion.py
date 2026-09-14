#!/usr/bin/env python3
"""Bandingkan workspace output/ (baru) vs src/data/ (promosi lama):
- primary_readings berubah (kanji, lama → baru)
- contoh kata berganti (slot on/kun kata lama → kata baru)
- kanji yang kehilangan/mendapat contoh
Exit code 0 selalu; output ringkasan utk audit manual.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEVELS = ["n5", "n4", "n3", "n2", "n1"]

prim_changes = []
ex_changes = []
lost_examples = []
gained_examples = []

for lv in LEVELS:
    old = {k["kanji"]: k for k in json.loads((ROOT / "src/data" / f"{lv}.json").read_text(encoding="utf-8"))}
    new = {k["kanji"]: k for k in json.loads((ROOT / "output" / f"{lv}.json").read_text(encoding="utf-8"))}
    old_ex = json.loads((ROOT / "src/data" / f"{lv}_examples.json").read_text(encoding="utf-8"))
    new_ex = json.loads((ROOT / "output" / f"{lv}_examples.json").read_text(encoding="utf-8"))

    for k, e in new.items():
        o = old.get(k)
        if o is None:
            continue
        # primary diff (bandingkan pasangan kana+type, urutan diabaikan utk ringkas)
        def prset(x):
            return [(p["kana"], p["type"]) for p in (x.get("primary_readings") or [])]
        if prset(o) != prset(e):
            prim_changes.append((lv, k, prset(o), prset(e)))
        # examples diff
        ow = [x["word"] for x in old_ex.get(k, [])]
        nw = [x["word"] for x in new_ex.get(k, [])]
        if ow != nw:
            ex_changes.append((lv, k, ow, nw))
        if len(nw) == 0 and len(ow) > 0:
            lost_examples.append((lv, k))
        if len(nw) > 0 and len(ow) == 0:
            gained_examples.append((lv, k))

print(f"Primary berubah : {len(prim_changes)} kanji")
for lv, k, o, n in prim_changes:
    print(f"  {lv} {k}: {' / '.join(a for a, _ in o)} -> {' / '.join(a for a, _ in n)}")
print(f"\nContoh berganti : {len(ex_changes)} kanji")
for lv, k, o, n in ex_changes[:80]:
    print(f"  {lv} {k}: {'・'.join(o)} -> {'・'.join(n)}")
if len(ex_changes) > 80:
    print(f"  ... dan {len(ex_changes) - 80} lainnya")
print(f"\nKehilangan SEMUA contoh: {len(lost_examples)} kanji {lost_examples[:20]}")
print(f"Mendapat contoh (dulu kosong): {len(gained_examples)} kanji {gained_examples[:20]}")

# Paritas struktur: jumlah kanji & urutan unit
for lv in LEVELS:
    old = json.loads((ROOT / "src/data" / f"{lv}.json").read_text(encoding="utf-8"))
    new = json.loads((ROOT / "output" / f"{lv}.json").read_text(encoding="utf-8"))
    same_order = [k["kanji"] for k in old] == [k["kanji"] for k in new]
    same_units = [k["unit"] for k in old] == [k["unit"] for k in new]
    print(f"{lv}: {len(new)} kanji, urutan sama={same_order}, unit sama={same_units}")
