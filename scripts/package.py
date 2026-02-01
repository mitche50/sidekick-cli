#!/usr/bin/env python3
"""Package skills as ZIP files for upload.

Creates zips where the *skill folder* is the root of the archive:
  <skill-name>.zip
    <skill-name>/SKILL.md
    <skill-name>/...

Usage:
  python3 scripts/package.py --all
  python3 scripts/package.py --skill planning-before-implementation
"""

from __future__ import annotations

import argparse
import os
import sys
import zipfile
from pathlib import Path


SKILL_FILENAME = "SKILL.md"
DEFAULT_OUTDIR = "dist"

IGNORE_NAMES = {
    ".DS_Store",
    "Thumbs.db",
    "__pycache__",
}


def repo_root_from_this_file() -> Path:
    return Path(__file__).resolve().parents[1]


def is_skill_dir(p: Path) -> bool:
    return p.is_dir() and (p / SKILL_FILENAME).is_file()


def iter_skill_dirs(repo_root: Path) -> list[Path]:
    return sorted([p for p in repo_root.iterdir() if is_skill_dir(p)])


def should_ignore(path: Path) -> bool:
    # ignore any ignored directory/file names, and dist/ outputs
    parts = set(path.parts)
    if any(p in IGNORE_NAMES for p in path.parts):
        return True
    if "dist" in parts:
        return True
    return False


def zip_skill(skill_dir: Path, out_zip: Path) -> None:
    # Ensure parent exists
    out_zip.parent.mkdir(parents=True, exist_ok=True)

    # Build zip with correct root folder
    with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for file_path in sorted(skill_dir.rglob("*")):
            if file_path.is_dir():
                continue
            if should_ignore(file_path):
                continue

            # archive name must start with "<skill_dir.name>/..."
            arcname = f"{skill_dir.name}/{file_path.relative_to(skill_dir).as_posix()}"
            z.write(file_path, arcname)


def main() -> int:
    parser = argparse.ArgumentParser(description="Package Claude skills into zips for upload.")
    parser.add_argument("--repo-root", type=Path, default=repo_root_from_this_file(),
                        help="Path to the repo root (defaults to this repo).")
    parser.add_argument("--outdir", type=Path, default=Path(DEFAULT_OUTDIR),
                        help="Output directory (default: ./dist).")
    parser.add_argument("--all", action="store_true", help="Package all skills.")
    parser.add_argument("--skill", action="append", default=[], help="Package a specific skill (repeatable).")

    args = parser.parse_args()

    repo_root = args.repo_root.resolve()
    outdir = (repo_root / args.outdir).resolve() if not args.outdir.is_absolute() else args.outdir.resolve()

    all_skills = iter_skill_dirs(repo_root)
    if args.all:
        skills = all_skills
    else:
        wanted = set(args.skill)
        if not wanted:
            print("ERROR: specify --all or --skill <name>.", file=sys.stderr)
            return 2
        skills = [s for s in all_skills if s.name in wanted]
        missing = wanted - {s.name for s in skills}
        if missing:
            print(f"ERROR: skill(s) not found: {', '.join(sorted(missing))}", file=sys.stderr)
            return 2

    outdir.mkdir(parents=True, exist_ok=True)

    for s in skills:
        out_zip = outdir / f"{s.name}.zip"
        zip_skill(s, out_zip)
        print(f"PACKAGED: {out_zip}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
