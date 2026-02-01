# Claude Skills — Personal Repo

This repository is designed to be your **single, version-controlled “skills folder”** that you can use across all your codebases.

It ships with a starter set of engineering workflow skills (parallelization, planning, prompt improvement, bug-fixing loops, etc.) and includes helper scripts to validate, index, and package skills for upload.

---

## Quick start (recommended)

### Option A — Make this your personal skills folder
Clone this repo into your Claude personal skills directory:

```bash
mkdir -p ~/.claude
git clone <YOUR_GITHUB_REPO_URL> ~/.claude/skills
```

Claude Code will treat each subfolder that contains a `SKILL.md` as an available skill.

### Option B — Keep it anywhere + install via symlinks/copy
If you’d rather keep the repo elsewhere:

```bash
python3 scripts/install.py --dest ~/.claude/skills --mode symlink
```

Use `--mode copy` if symlinks aren’t desired/available.

---

## Included skills

- `automating-bug-fixes` — Drives an autonomous bug-fix loop from logs or failing tests to a patch, minimizing micromanagement and emphasizing verification.
- `delegating-subagents` — Decomposes complex tasks into parallel subagent work across separate LLM sessions, then synthesizes results and runs a gatekeeper review.
- `developing-reusable-commands` — Turns repeated LLM or router workflows into reusable local CLI commands or scripts with docs, safe defaults, and examples.
- `explaining-and-quizzing` — Switches into teaching mode by explaining changes, generating diagrams, and running spaced-repetition quizzes while storing learnings locally.
- `improving-prompts` — Iteratively improves prompts and specs using critique, stricter acceptance criteria, and rewrite cycles to raise output quality.
- `integrating-local-data-tools` — Integrates local data and analytics CLIs (sqlite3, jq, csv tools) via scripted wrappers so analysis is reproducible and safe-by-default.
- `maintaining-local-knowledge-base` — Captures lessons learned into a persistent, version-controlled knowledge base and suggests how to inject it into prompts.
- `optimizing-terminal-environment` — Suggests terminal, tmux, and shell ergonomics to speed task switching across worktrees and LLM sessions in local dev workflows.
- `parallelizing-workflows` — Guides parallel coding using git worktrees or clones and isolated LLM sessions per task to reduce context bleed.
- `planning-before-implementation` — Produces a plan-first workflow (plan, review, execute, re-plan) for complex tasks before making code changes.

---

## Repo layout

- `/<skill-name>/SKILL.md` — one folder per skill
- `/docs/` — setup + authoring guidance
- `/scripts/` — utilities to validate, index, install, and package skills
- `/dist/` — build output (zips); ignored by git

---

## Common workflows

### Validate skills
```bash
python3 scripts/validate.py
```

### Regenerate `INDEX.md`
```bash
python3 scripts/generate_index.py
```

### Package skills for upload to Claude Web/Desktop
```bash
python3 scripts/package.py --all
# zips appear in ./dist
```

Upload individual skill zips via Claude Settings → Capabilities → Skills → “Upload skill”.

---

## Adding a new skill

1. Create a new folder at repo root:
   ```bash
   mkdir -p my-new-skill
   ```
2. Add `SKILL.md` with YAML frontmatter:
   ```md
   ---
   name: my-new-skill
   description: One sentence describing what it does and when to use it.
   ---
   ```
3. Add optional supporting files (examples, templates, scripts).
4. Run:
   ```bash
   python3 scripts/validate.py
   python3 scripts/generate_index.py
   ```

See `docs/AUTHORING_GUIDE.md` for conventions.

---

## Notes on scope

- **Personal skills** apply to all projects.
- **Project skills** live at `.claude/skills/<skill-name>/SKILL.md` inside a repo.
- In monorepos, nested `.claude/skills/` folders can be discovered relative to where you’re working.

See `docs/SETUP.md` for details.
