# Sidekick

Your agent's always-on cheat sheet. Sidekick compiles the playbooks, rules, and context your AI coding agents need -- so they stop guessing and start consulting.

Think of it as a context compiler: you write modular skills and playbooks, Sidekick assembles them into a single `AGENTS.md` that every major AI coding tool can read. One build, every agent, always up to date.

This repo is the Sidekick library and toolchain:
- A curated set of skills and playbooks (each folder with `SKILL.md`).
- A minimal CLI that compiles `AGENTS.md` and a compact lookup index.
- Telemetry hooks so you can see which playbooks your agents actually used.

---

## Why Sidekick (vs. manual skills)?

Manual skills are powerful, but they’re easy to forget, hard to keep consistent, and tricky to audit. Sidekick turns them into a reliable system that doesn’t require a clipboard and a prayer.

- **Always-on context**: compiles the right pieces into a single `AGENTS.md` so critical rules aren’t missed.
- **Deterministic visibility**: optional wrapper enforces “Sources consulted” for reliable usage tracking.
- **Budgeted + indexed**: keeps context small and searchable instead of a growing pile of files.
- **Safe adapters**: one source of truth, many tools (Aider, Gemini, etc.) without duplicate maintenance.

---

## How it works (kernel + playbooks)

Sidekick compiles a small, always-on **kernel** plus a searchable **index**:

- **Kernel**: the compact, high-priority rules that must apply to every task. Each skill contributes a tiny `snippets/kernel.md` that gets merged into `AGENTS.md`.
- **Playbooks**: long-form guidance in `playbook.md`, referenced via the index and pulled in only when relevant.

This keeps the always-on context tight, while still giving you deep, task-specific guidance on demand.

---

## Quick start

### Install the CLI

```bash
npm install -g @mitche50/sidekick-cli
```

### Add a skills repo

Add a skills repo into a local cache and load a module:

```bash
sidekick add --repo owner/repo --skill planning-before-implementation
```

### Use Sidekick in a project

From any repo where you want your agents to have context:

```bash
sidekick init
sidekick add planning-before-implementation
sidekick build
```

This creates:
```
AGENTS.md                  <- the compiled guidance your agents read
AGENT.md                   <- symlink (for tools that expect this name)
GEMINI.md                  <- symlink (for Gemini)
.aider.conf.yml            <- adapter for Aider
.gemini/settings.json      <- adapter for Gemini settings
.sidekick/
  config.json              <- your project config
  sidekick.lock.json       <- integrity lock
  index.min.txt            <- compact module index
  telemetry/               <- local usage logs
```

### Module discovery

Sidekick looks for modules in this order:

1. `./skills` (project-local)
2. `./.agents/skills` (project-local)
3. `~/.agents/skills` (global)

Override with `moduleDirs` in `.sidekick/config.json`.

---

## CLI commands

```text
sidekick init
sidekick build
sidekick add <module>
sidekick add --repo <path-or-github> [--skill <name>] [--cache-dir <dir>]
sidekick update [--repo <path-or-github>] [--ref <ref>] [--dir <path>]
sidekick remove <module>
sidekick list
sidekick report
sidekick trace module <name> --files <paths>
sidekick run -- <command>
sidekick promote [module] [--top N] [--dry-run]
```

**What they do:**
- `init` -- creates `.sidekick/config.json` and the telemetry folder.
- `build` -- compiles `AGENTS.md`, the index, the lockfile, and all adapters.
- `add` / `remove` -- loads or unloads a module from your config.
- `add --repo` -- installs a skills repo into a local cache and adds a module.
- `update` -- refreshes skills in a target directory from the same source (or `--repo`).
- `list` -- shows discovered modules with descriptions and whether they are already added.
- `report` -- shows which modules your agents consulted vs. which they should have.
- `trace` -- manually logs that a module was used.
- `run` -- wraps an agent command and enforces source tracking.
- `promote` -- lifts frequently-missed kernel rules into your project template.

**Recommended flow:**
- Use `add --repo` when you want a project-local cache of a specific skills repo.
- Use `update` to refresh a previously installed skills directory (global or local).

---

## Adapters (available outputs)

Sidekick writes small compatibility files so every AI tool reads the same `AGENTS.md` without extra setup:

| File | Purpose |
|---|---|
| `AGENT.md` | Symlink to `AGENTS.md` |
| `GEMINI.md` | Symlink to `AGENTS.md` |
| `.aider.conf.yml` | `read: AGENTS.md` |
| `.gemini/settings.json` | Points Gemini at `AGENTS.md` |
| `.github/copilot-instructions.md` | Copilot repo instructions |
| `CLAUDE.md` | Claude Code repo instructions |
| `.cursor/rules/sidekick.mdc` | Cursor rules |
| `.windsurf/rules/sidekick.md` | Windsurf rules |
| `.clinerules/sidekick.md` | Cline rules |
| `.aiassistant/rules/sidekick.md` | JetBrains AI Assistant rules |
| `replit.md` | Replit Agent instructions |

Default adapters are `AGENT.md`, `GEMINI.md`, `.aider.conf.yml`, and `.gemini/settings.json`.
Optional adapters (Copilot/Claude/Cursor/Windsurf/Cline/JetBrains/Replit) are off by default.
Disable or customize adapters in `.sidekick/config.json`.
Set `adapters.force` to `true` if you want Sidekick to overwrite existing adapter files it didn't create.
Adapters are implemented via a small registry in core so new adapters follow the same safety + preflight pattern. See `CONTRIBUTING.md` for the short adapter checklist.

---

## Kernel template precedence

Sidekick compiles your final `AGENTS.md` kernel from two sources:

1. **Project override**: `templates/agents-md/kernel.md` in the project where you run `sidekick build`.
2. **Package default**: the bundled template inside `@mitche50/sidekick-core`.

If the project override exists, it wins. If it doesn’t, Sidekick falls back to the package default.

---

## Source tracking (optional wrapper)

Want to know if your agent actually read its playbook? Wrap the run:

```bash
sidekick run -- <agent-command>
```

The wrapper looks for a `Sources consulted: ...` line in the agent's output. If the agent doesn't cite sources, the run fails (use `--allow-missing` to be lenient).

For local dev without a global install:
```bash
node ~/.agents/skills/packages/sidekick-cli/bin/sidekick.js run -- <agent-command>
```

Example (GitHub repo):
```bash
sidekick add --repo owner/repo --skill my-skill
```

Example (local path):
```bash
sidekick add --repo ../skills-repo --skill my-skill
```

Notes:
- Repos are cached under `~/.agents/skills/.sidekick-cache` by default (override with `--cache-dir`).
- GitHub installs use `git clone` (so `git` must be available).
- If a repo contains **one** skill, `--skill` is optional; otherwise you must specify it.
- Repos can expose skills at repo root or under `./skills/<skill>/`.
- Failed installs are cleaned up so you can retry without manual cache deletion.
- If you haven't updated a skills directory before, run `sidekick update --repo <path-or-github> --dir <target>`.

Update installed skills:
```bash
sidekick update
```

Note: `update` replaces the target directory contents to ensure a clean sync.

---

## Configuration

Sidekick reads `.sidekick/config.json` in each project. Created on `sidekick init`.

```json
{
  "version": 1,
  "modules": ["planning-before-implementation"],
  "moduleDirs": ["./skills", "./.agents/skills", "~/.agents/skills"],
  "adapters": {
    "agentsMd": true,
    "symlinkFiles": ["AGENT.md", "GEMINI.md"],
    "aiderConf": true,
    "geminiSettings": true,
    "copilotInstructions": false,
    "claudeMd": false,
    "claudeMdSymlink": false,
    "cursorRules": false,
    "windsurfRules": false,
    "clineRules": false,
    "jetbrainsRules": false,
    "replitMd": false,
    "force": false
  },
  "budgets": {
    "agentsMdKernelMaxBytes": 10000,
    "indexMaxBytes": 12000
  },
  "telemetry": {
    "enabled": true,
    "mode": "local"
  }
}
```

**Key settings:**
- `moduleDirs` -- ordered search path for modules.
- `adapters.force` -- set to `true` to overwrite files Sidekick didn't create.
- `claudeMdSymlink` -- set to `true` to symlink `CLAUDE.md` to `AGENTS.md` (copy fallback).
- `budgets` -- hard limits. Builds fail if exceeded (your agent's context window will thank you).
- `telemetry.mode` -- currently `local` only.
- Override the kernel template per project by adding `templates/agents-md/kernel.md` at the repo root.
- `AGENTS.md` is always written when any adapter is enabled (symlinks and configs depend on it).
- On Windows, some commands may need `sidekick run -- cmd /c <command>` for quoting or shell built-ins.

---

## Promote rules

Telemetry showing repeated misses? Promote a module's kernel rules into your project template so they're always on:

```bash
sidekick promote
```

This picks the least-consulted module and promotes up to 5 rules from its `snippets/kernel.md` into `templates/agents-md/kernel.md`. Target a specific module:

```bash
sidekick promote planning-before-implementation --top 7
```

Use `--dry-run` to preview without writing.

---

## Module structure

Each skill folder is compatible with agent skills workflows and includes Sidekick metadata:

```
skills/<module-name>/
  SKILL.md                 <- agent-facing skill definition
  sidekick.module.json     <- module manifest
  playbook.md              <- detailed guidance
  snippets/
    kernel.md              <- rules compiled into AGENTS.md
```

The CLI reads `sidekick.module.json` to locate playbooks and kernel snippets.
Define `triggers` in the manifest to control when a module appears in reports.

---

## Repo layout

```
/skills/<skill-name>/SKILL.md     -- one folder per skill
/packages/sidekick-cli     -- the CLI
/packages/sidekick-core    -- compiler internals
/templates/agents-md       -- default AGENTS.md kernel template
/docs                      -- setup, authoring, troubleshooting
CHANGELOG.md               -- release history
```

---

## Common workflows

### Build AGENTS.md for this repo
```bash
sidekick init
sidekick add planning-before-implementation
sidekick build
```

---

## Adding a new skill

1. Create a folder under `skills/` (project-local default):
   ```bash
   mkdir -p skills/my-new-skill
   ```
2. Add `SKILL.md` with YAML frontmatter:
   ```md
   ---
   name: my-new-skill
   description: One sentence -- what it does and when to use it.
   ---
   ```
3. Add Sidekick files:
   - `sidekick.module.json`
   - `playbook.md`
   - `snippets/kernel.md`
4. Run `sidekick build` in any consuming repo to pick up the new module.

Tip: for a global library, place skills under `~/.agents/skills/<skill-name>/`.

See `docs/AUTHORING_GUIDE.md` for conventions.

---

## Sidekick development

### Local development (no publish)

```bash
cd /path/to/your-project
node ~/.agents/skills/packages/sidekick-cli/bin/sidekick.js init
node ~/.agents/skills/packages/sidekick-cli/bin/sidekick.js add planning-before-implementation
node ~/.agents/skills/packages/sidekick-cli/bin/sidekick.js build
```

### Publish (optional)

Packages are scoped to `@mitche50`. Publish from the package directories (the repo root is private).

```bash
cd packages/sidekick-core
npm publish --access public
cd ../sidekick-cli
npm publish --access public
```

Or in one shot:

```bash
npm run publish:all
```
