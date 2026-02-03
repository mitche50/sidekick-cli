# Authoring guide

A few conventions to keep skills discoverable, maintainable, and safe to share.

---

## Folder + file rules

- One skill = one folder at repo root (e.g., `planning-before-implementation/`)
- Each skill folder **must** contain `SKILL.md`
- Optional: `examples/`, `templates/`, `resources/`

---

## YAML frontmatter (required)

At the top of `SKILL.md`:

```yaml
---
name: <kebab-case-name>
description: <what it does + when to use it>
---
```

Tips:

- `name` should match the folder name exactly
- Lowercase letters, numbers, and hyphens only
- Keep `description` short, specific, and trigger-rich -- include the keywords a user is likely to say when they need this skill

---

## Write for progressive disclosure

Agents read your skill in layers:

1. **Frontmatter first** (`name`, `description`) -- for discovery
2. **Body next** (instructions) -- if the skill matches
3. **Supporting files** -- only if referenced and needed

Design the first ~30 lines of your skill to cover:
- What it does
- When to use it
- What inputs it needs
- What output format to produce

---

## Examples beat prose

Put at least one realistic example in `examples/`:

- `examples/example-1.input.md`
- `examples/example-1.output.md`

Reference them from `SKILL.md`:

> See `examples/example-1.output.md` for the desired structure and tone.

---

## Prefer safe defaults

If your skill suggests commands:

- Start with read-only commands (`git status`, `git diff`, `ls`)
- Avoid destructive operations unless explicitly requested
- Include a "rollback" section when relevant

---

## Keep skills focused

Avoid "kitchen sink" skills. If a skill is growing too large:
- Extract supporting docs into `docs/` inside the skill folder
- Or split into multiple skills with clearer triggers
