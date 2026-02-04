---
name: developing-reusable-commands
description: Turns repeated LLM or router workflows into reusable local CLI commands or scripts with docs, safe defaults, and examples.
---

## Goal
If a workflow repeats, make it a command. This skill standardizes how to convert an ad-hoc sequence into a reusable script the user can run and share.

## Use when
- The user repeats the same multi-step prompt or manual process frequently.
- The user asks for “a command for this”, “make a script”, or “automation”.
- The workflow involves gathering context (logs, diffs, file lists) and routing to a model.

## Procedure
1. **Define the workflow contract**
   - Inputs (flags/args), outputs (files, stdout), and side effects.
   - Decide safe-by-default behavior (read-only unless `--write`).

2. **Choose implementation level**
   - Bash for glue.
   - Python when parsing/templating is needed.
   - Keep dependencies minimal.

3. **Generate the command skeleton**
   - Usage/help text
   - Argument parsing
   - Clear exit codes
   - “dry-run” support where destructive

4. **Bake in reproducibility**
   - Save the exact prompt/context bundle to `./runs/<timestamp>/`
   - Write outputs (plan, patch, notes) to predictable paths

5. **Document it**
   - `README.md` snippet: purpose, install, examples
   - Add 2–3 common recipes

## Output format
- Command name + purpose
- Proposed CLI interface (flags)
- Script skeleton (copy/paste)
- Directory layout for outputs
- Example invocations

## Example: /techdebt command contract
- `techdebt scan` → list duplicates, dead code, long functions
- `techdebt report --format md` → write a report to `reports/techdebt.md`

## Guardrails
- Default to read-only actions.
- Never embed secrets in scripts.
- If the user’s environment is unknown, avoid OS-specific assumptions; provide variants.
