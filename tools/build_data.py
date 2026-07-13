#!/usr/bin/env python3
"""Bundle phoney's locale data into a single JSON for the extension.

Reads name lists, phone formats, and email domains from a phoney checkout
and emits extension/data/personas.json. Names are capped per list to keep
the bundle small; generation quality doesn't need thousands of names.
"""
import json
import sys
from pathlib import Path

PHONEY = Path(sys.argv[1] if len(sys.argv) > 1 else "/root/phoney")
OUT = Path(__file__).resolve().parent.parent / "extension" / "data" / "personas.json"
MAX_NAMES = 120

def read_list(path):
    if not path.exists():
        return []
    lines = [l.strip() for l in path.read_text(encoding="utf-8").splitlines()]
    return [l for l in lines if l and not l.startswith("#")][:MAX_NAMES]

phone_formats = json.loads((PHONEY / "data" / "phone_formats.json").read_text())
email_domains = json.loads((PHONEY / "data" / "email_domains.json").read_text())

locales = {}
for locale_dir in sorted((PHONEY / "data" / "name_data").glob("*/*")):
    if not locale_dir.is_dir():
        continue
    loc = locale_dir.name
    male = read_list(locale_dir / "male.txt")
    female = read_list(locale_dir / "female.txt")
    last = read_list(locale_dir / "last.txt")
    if not (male or female) or not last:
        continue
    locales[loc] = {
        "male": male,
        "female": female,
        "last": last,
        "phone": phone_formats.get(loc, phone_formats.get("en_US", "###-###-####")),
        "domains": email_domains.get(loc, email_domains.get("en_US", ["gmail.com"])),
    }

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({"locales": locales}, ensure_ascii=False, separators=(",", ":")))
size = OUT.stat().st_size
print(f"{len(locales)} locales -> {OUT} ({size/1024:.0f} KB)")
