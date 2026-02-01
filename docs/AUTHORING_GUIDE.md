# Authoring guide

This repo follows a few conventions to keep skills discoverable, maintainable, and safe to share.

---

## Folder + file rules

- One skill = one folder at repo root (e.g., `planning-before-implementation/`)
- Each skill folder **must** contain `SKILL.md`
- Optional: `examples/`, `templates/`, `scripts/`, `resources/`

---

## YAML frontmatter (required)

At the very top of `SKILL.md`:

```yaml
---
name: <kebab-case-name>
description: <what it does + when to use it>
---
```

Guidelines:

- `name` should match the folder name
- Use lowercase letters, numbers, and hyphens only
- Keep `description` short, specific, and “trigger rich” (include keywords users are likely to say)

---

## Write for progressive disclosure

Claude reads:

1. **Frontmatter first** (`name`, `description`) for discovery
2. **Body next** (instructions) if the skill is relevant
3. **Supporting files** only if referenced and needed

Design your skill so the first ~30 lines explain:
- what the skill does
- when to use it
- what inputs it needs
- what output format it should produce

---

## Examples help more than prose

Put at least one realistic example in `examples/`:

- `examples/example-1.input.md`
- `examples/example-1.output.md`

Then reference them from `SKILL.md`, e.g.:

> See `examples/example-1.output.md` for the desired structure and tone.

---

## Prefer safe defaults

If your skill suggests commands:

- Prefer read-only commands first (`git status`, `git diff`, `ls`)
- Avoid destructive commands unless explicitly requested
- When relevant, include a “rollback” section

---

## Keep skills focused

Avoid “kitchen sink” skills. If you notice a skill growing too large:
- extract supporting documentation into `docs/` inside the skill folder
- or split into multiple skills with clearer triggers
