# Setup and storage

This repo is structured so you can:

- **Version control** your skills with GitHub
- **Install once** and use them across all codebases (personal skills)
- **Optionally** copy/symlink a subset into specific projects

---

## 1) What a Skill is

A Skill is a **directory** containing a required entry file (`SKILL.md`) plus optional supporting files like:

- `examples/` — sample inputs/outputs
- `templates/` — templates Claude can fill in
- `scripts/` — scripts Claude can execute (optional; use carefully)

Claude primarily uses the `name` + `description` fields in YAML frontmatter to decide when a skill is relevant.
When invoked, Claude reads the full markdown body and can explore linked supporting files.

---

## 2) Where skills live (Claude Code)

Claude Code supports multiple locations; choose the one that matches your goal:

- **Personal (recommended for “all codebases”)**
  - `~/.claude/skills/<skill-name>/SKILL.md`
  - Available across all your projects.

- **Project**
  - `.claude/skills/<skill-name>/SKILL.md`
  - Only applies to that repo.

- **Monorepo packages**
  - Claude Code can discover nested `.claude/skills/` directories relative to where you're working (e.g., `packages/frontend/.claude/skills/`).

If the same skill name exists in multiple levels, higher-priority locations win.

---

## 3) How to install this repo

### Option A — Clone into the personal skills directory (recommended)

```bash
mkdir -p ~/.claude
git clone <YOUR_GITHUB_REPO_URL> ~/.claude/skills
```

### Option B — Clone anywhere + install via script

```bash
git clone <YOUR_GITHUB_REPO_URL> ~/ai/claude-skills
cd ~/ai/claude-skills
python3 scripts/install.py --dest ~/.claude/skills --mode symlink
```

---

## 4) Uploading skills to Claude Web/Desktop

Claude Web/Desktop uses ZIP uploads:

- Zip **the skill folder**, not just its contents.
- The zip must contain the skill folder at the root.

This repo includes a packager:

```bash
python3 scripts/package.py --all
# output: ./dist/<skill-name>.zip
```

Then upload each zip in Claude Settings → Capabilities → Skills.

---

## 5) Recommended day-to-day workflow

- Edit skills in this repo
- Validate + regenerate the index
- Package to `dist/` when you need zips to upload/share

```bash
python3 scripts/validate.py
python3 scripts/generate_index.py
python3 scripts/package.py --all
```
