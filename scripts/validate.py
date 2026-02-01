#!/usr/bin/env python3
"""Validate this repo's skills.

Checks:
- Skill directory contains SKILL.md
- SKILL.md begins with YAML frontmatter bounded by --- markers
- Frontmatter contains required keys: name, description
- name matches folder name
- name uses lowercase letters, numbers, hyphens
- description is non-empty and <= 200 chars (warn if longer)

Usage:
  python3 scripts/validate.py
"""

from __future__ import annotations

import sys
import re
from pathlib import Path


SKILL_FILENAME = "SKILL.md"
NAME_RE = re.compile(r"^[a-z0-9-]+$")


def repo_root_from_this_file() -> Path:
    return Path(__file__).resolve().parents[1]


def is_skill_dir(p: Path) -> bool:
    return p.is_dir() and (p / SKILL_FILENAME).is_file()


def parse_frontmatter(skill_md_text: str) -> dict[str, str] | None:
    # Require frontmatter at very top
    if not skill_md_text.startswith("---"):
        return None
    # Find second --- line
    parts = skill_md_text.split("\n")
    if len(parts) < 3:
        return None
    if parts[0].strip() != "---":
        return None

    # Collect until next --- line
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
    errors: list[str] = []
    warnings: list[str] = []

    for d in sorted(repo_root.iterdir()):
        if not is_skill_dir(d):
            continue

        skill_md = d / SKILL_FILENAME
        text = skill_md.read_text(encoding="utf-8")
        fm = parse_frontmatter(text)
        if fm is None:
            errors.append(f"{d.name}: {SKILL_FILENAME} missing valid YAML frontmatter at top.")
            continue

        name = fm.get("name", "")
        desc = fm.get("description", "")

        if not name:
            errors.append(f"{d.name}: frontmatter missing required field 'name'.")
        if not desc:
            errors.append(f"{d.name}: frontmatter missing required field 'description'.")

        if name and name != d.name:
            errors.append(f"{d.name}: frontmatter name '{name}' does not match folder name '{d.name}'.")

        if name and not NAME_RE.match(name):
            errors.append(f"{d.name}: name '{name}' must match regex {NAME_RE.pattern}.")

        if desc and len(desc) > 200:
            warnings.append(f"{d.name}: description is {len(desc)} chars (>200). Consider shortening.")

    if warnings:
        print("WARNINGS:")
        for w in warnings:
            print(" -", w)
        print()

    if errors:
        print("ERRORS:", file=sys.stderr)
        for e in errors:
            print(" -", e, file=sys.stderr)
        return 1

    print("OK: all skills validated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
