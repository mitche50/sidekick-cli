# Troubleshooting

## Skill isn't triggering automatically
- Ensure `SKILL.md` exists and has valid YAML frontmatter.
- Make the `description` more specific and include likely user keywords.
- Try invoking directly using the slash command: `/<name>`.

## Skill triggers too often
- Narrow the `description` (remove overly broad terms).
- Add negative triggers or clearer “Use when” guidance in the body.

## Claude can’t see my skills
- Confirm the skill folder lives in one of the supported locations:
  - personal: `~/.claude/skills/<skill-name>/SKILL.md`
  - project: `.claude/skills/<skill-name>/SKILL.md`
- Validate with `python3 scripts/validate.py`.

## ZIP upload fails
- Ensure the ZIP contains the **folder** at the root:
  - correct: `my-skill.zip -> my-skill/SKILL.md`
  - incorrect: `my-skill.zip -> SKILL.md` at ZIP root
- Rebuild zips with `python3 scripts/package.py --all`.
