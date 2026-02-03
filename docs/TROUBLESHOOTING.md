# Troubleshooting

## Skill isn't triggering automatically
- Confirm `SKILL.md` exists and has valid YAML frontmatter.
- Make the `description` more specific -- include the keywords a user would actually say.
- Try invoking it directly: `/<name>`.

## Skill triggers too often
- Narrow the `description` (remove overly broad terms).
- Add clearer "Use when" guidance in the body, or add negative triggers.

## Agent can't find my skills
- Check that the skill folder lives in a supported location:
  - Personal: `~/.agents/skills/<skill-name>/SKILL.md`
  - Project: `.agents/skills/<skill-name>/SKILL.md`
- Run `sidekick report` to confirm modules are being detected.

## Build fails with budget exceeded
- Your compiled kernel or index is too large. Check `budgets` in `.sidekick/config.json`.
- The error message lists the largest offenders -- trim those kernel snippets first.

## Adapter won't overwrite
- Sidekick won't clobber files it didn't create. Set `adapters.force: true` in your config if you want to override.
