# Contributing

This repo is meant to be your personal (or team) Sidekick module library. Here's how to keep it clean.

## Before you open a PR

- Keep changes focused -- one module per PR is ideal.
- Make sure module metadata and snippets are up to date.
- Run `sidekick build` to confirm nothing breaks.

## Adding a skill

1. Create a folder at repo root, named in kebab-case (gerund form preferred).
2. Add `SKILL.md` with required YAML frontmatter (`name`, `description`).
3. Add examples or templates as needed.
4. Add `sidekick.module.json`, `playbook.md`, and `snippets/kernel.md`.
5. Run `sidekick build` in a consuming repo to verify it compiles.

## Safety

If your playbook suggests commands:
- Prefer read-only tooling first
- Avoid destructive operations by default
- Document exactly what each command does in `playbook.md`

See `docs/AUTHORING_GUIDE.md` for full conventions.
