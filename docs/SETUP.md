# Setup and storage

This repo gives you:

- **Version-controlled skills** via GitHub
- **One skills library, every codebase** (personal skills directory)
- **Optional per-project overrides** via symlinks or copies
- **Compiled AGENTS.md** via Sidekick, so your agents always have context

---

## 0) Sidekick (the context compiler)

Sidekick assembles `AGENTS.md` and a compact index from your selected modules:

```bash
sidekick init
sidekick add planning-before-implementation
sidekick build
```

This creates:
```
AGENTS.md                  <- compiled guidance
AGENT.md                   <- symlink adapter
GEMINI.md                  <- symlink adapter
.aider.conf.yml            <- Aider adapter
.gemini/settings.json      <- Gemini adapter
.sidekick/
  config.json
  sidekick.lock.json
  index.min.txt
  telemetry/
```

## 1) What a Skill is

A Skill is a **directory** containing a required entry file (`SKILL.md`) plus optional supporting files:

- `examples/` -- sample inputs/outputs
- `templates/` -- templates an agent can fill in

Agents use the `name` + `description` fields in YAML frontmatter to decide when a skill is relevant.
When invoked, an agent reads the full markdown body and can explore linked supporting files.

---

## 2) Where skills live

Agents that support `SKILL.md` discovery look in these locations:

- **Personal (recommended)**
  - `~/.agents/skills/<skill-name>/SKILL.md`
  - Available across all your projects.

- **Project-local**
  - `.agents/skills/<skill-name>/SKILL.md`
  - Scoped to that repo.

- **Monorepo packages**
  - Agents can discover nested `.agents/skills/` directories relative to where you're working.

Sidekick resolves modules in this order by default:

1. `./skills`
2. `./.agents/skills`
3. `~/.agents/skills`

Override with `moduleDirs` in `.sidekick/config.json`.

To override the kernel template per project, add `templates/agents-md/kernel.md` at the repo root.

If the same skill name exists at multiple levels, the higher-priority location wins.

---

## 3) Adding skills to a project

Use a local cache for a specific repo and load a module:

```bash
sidekick add --repo owner/repo --skill planning-before-implementation
```

If you want a global skills library shared across projects, install it into `~/.agents/skills`:

```bash
sidekick update --repo mitche50/sidekick-cli --dir ~/.agents/skills
sidekick add planning-before-implementation
```

---

## 4) Day-to-day workflow

- Edit skills in this repo
- Rebuild `AGENTS.md` in any repo that consumes these modules:

```bash
node ~/.agents/skills/packages/sidekick-cli/bin/sidekick.js build
```
