# Contributing

This repo is meant to be your personal (or team) Skills library.

## Before you open a PR / merge a change
- Run `python3 scripts/validate.py`
- Run `python3 scripts/generate_index.py`
- Keep changes focused (one skill per PR is ideal)

## Adding a skill
1. Create a folder at repo root named in kebab-case (gerund form preferred).
2. Add `SKILL.md` with required YAML frontmatter (`name`, `description`).
3. Add examples/templates/scripts as needed.
4. Add/refresh `INDEX.md`.

## Safety and scripts
If you add executable scripts:
- Prefer read-only tooling
- Avoid destructive operations by default
- Document exactly what the script does in `SKILL.md`
