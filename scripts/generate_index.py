#!/usr/bin/env python3
"""Generate INDEX.md from installed skills.

Usage:
  python3 scripts/generate_index.py
"""

from __future__ import annotations

import sys
import re
from pathlib import Path


SKILL_FILENAME = "SKILL.md"


def repo_root_from_this_file() -> Path:
    return Path(__file__).resolve().parents[1]


def is_skill_dir(p: Path) -> bool:
    return p.is_dir() and (p / SKILL_FILENAME).is_file()


def parse_frontmatter(skill_md_text: str) -> dict[str, str] | None:
    if not skill_md_text.startswith("---"):
        return None

    parts = skill_md_text.split("\n")
    if parts[0].strip() != "---":
        return None

    fm_lines = []
    for line in parts[1:]:
        if line.strip() == "---":
            break
        fm_lines.append(line)
    else:
        return None

    data: dict[str, str] = {}
    for line in fm_lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        data[k.strip()] = v.strip().strip('"')
    return data


def main() -> int:
    repo_root = repo_root_from_this_file()
    rows = []

    for d in sorted(repo_root.iterdir()):
        if not is_skill_dir(d):
            continue
        text = (d / SKILL_FILENAME).read_text(encoding="utf-8")
        fm = parse_frontmatter(text) or {}
        name = fm.get("name", d.name)
        desc = fm.get("description", "").strip()
        rows.append((name, desc))

    out = ["# Skill index", "", "| Skill | Description |", "| --- | --- |"]
    for name, desc in rows:
        out.append(f"| `{name}` | {desc} |")
    out.append("")

    (repo_root / "INDEX.md").write_text("\n".join(out), encoding="utf-8")
    print(f"Wrote {repo_root / 'INDEX.md'} with {len(rows)} skills.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
