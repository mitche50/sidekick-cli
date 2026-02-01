#!/usr/bin/env python3
"""Install this repo's skills into Claude's skills directory.

Typical usage:

  # If you cloned this repo somewhere other than ~/.claude/skills
  python3 scripts/install.py --dest ~/.claude/skills --mode symlink

Notes:
- By default this script will NOT overwrite existing destinations.
- Use --force to overwrite (destructive).
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path
import re


SKILL_FILENAME = "SKILL.md"
NAME_RE = re.compile(r"^[a-z0-9-]+$")


def repo_root_from_this_file() -> Path:
    return Path(__file__).resolve().parents[1]


def is_skill_dir(p: Path) -> bool:
    return p.is_dir() and (p / SKILL_FILENAME).is_file()


def iter_skill_dirs(repo_root: Path) -> list[Path]:
    return sorted([p for p in repo_root.iterdir() if is_skill_dir(p)])


def safe_unlink_or_rmtree(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink()
        return
    if path.is_dir():
        shutil.rmtree(path)
        return
    raise RuntimeError(f"Can't remove unknown path type: {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Install skills into a Claude skills directory.")
    parser.add_argument("--repo-root", type=Path, default=repo_root_from_this_file(),
                        help="Path to the repo root (defaults to this repo).")
    parser.add_argument("--dest", type=Path, default=Path("~/.claude/skills").expanduser(),
                        help="Destination skills folder (default: ~/.claude/skills).")
    parser.add_argument("--mode", choices=["symlink", "copy"], default="symlink",
                        help="Installation mode (default: symlink).")
    parser.add_argument("--skills", nargs="*", default=None,
                        help="Optional list of specific skill folder names to install. Default: all.")
    parser.add_argument("--force", action="store_true",
                        help="Overwrite existing destinations (DESTRUCTIVE).")

    args = parser.parse_args()

    repo_root = args.repo_root.resolve()
    dest_root = args.dest.expanduser().resolve()

    if not repo_root.is_dir():
        print(f"ERROR: repo root not found: {repo_root}", file=sys.stderr)
        return 2

    skills = iter_skill_dirs(repo_root)
    if args.skills:
        wanted = set(args.skills)
        skills = [s for s in skills if s.name in wanted]
        missing = wanted - {s.name for s in skills}
        if missing:
            print(f"ERROR: requested skills not found: {', '.join(sorted(missing))}", file=sys.stderr)
            return 2

    dest_root.mkdir(parents=True, exist_ok=True)

    installed = 0
    skipped = 0

    for s in skills:
        if not NAME_RE.match(s.name):
            print(f"SKIP (invalid folder name): {s.name}")
            skipped += 1
            continue

        dst = dest_root / s.name

        if dst.exists() or dst.is_symlink():
            # If it's already the exact symlink, treat as installed
            if dst.is_symlink() and dst.resolve() == s.resolve():
                print(f"OK (already linked): {dst} -> {s}")
                installed += 1
                continue

            if not args.force:
                print(f"SKIP (exists, use --force to overwrite): {dst}")
                skipped += 1
                continue

            print(f"OVERWRITE: {dst}")
            safe_unlink_or_rmtree(dst)

        if args.mode == "symlink":
            try:
                os.symlink(s, dst, target_is_directory=True)
                print(f"LINK: {dst} -> {s}")
            except OSError as e:
                print(f"WARN: symlink failed ({e}); falling back to copy")
                shutil.copytree(s, dst)
                print(f"COPY: {s} -> {dst}")
        else:
            shutil.copytree(s, dst)
            print(f"COPY: {s} -> {dst}")

        installed += 1

    print(f"\nDone. Installed: {installed}, Skipped: {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
