---
name: integrating-local-data-tools
description: Integrates local data and analytics CLIs (sqlite3, jq, csv tools) via scripted wrappers so analysis is reproducible and safe-by-default.
---

## Goal
Let the user (and local LLM workflows) analyze data via local tools instead of manual copy/paste, using repeatable commands and minimal friction.

## Use when
- The user needs to analyze CSV/JSON/logs/SQLite locally.
- The user asks for “a command to query this”, “analyze this dataset”, or “build a reusable query”.
- The user wants reproducible, scriptable analysis.

## Procedure
1. **Identify data sources**
   - file paths, formats, sizes, and privacy constraints.

2. **Pick the right CLI**
   - `sqlite3` for SQLite
   - `jq` for JSON
   - `python` for heavier transforms
   - `rg`/`awk`/`sed` for logs (simple extraction)

3. **Generate a safe wrapper**
   - Read-only by default.
   - Writes outputs to `analysis/outputs/<timestamp>/`.
   - Saves the exact command/query used.

4. **Produce analysis steps**
   - Start with exploratory stats (row count, nulls, unique values).
   - Then move to targeted questions.

## Output format
- Tool selection rationale
- Copy/paste commands (grouped)
- Optional wrapper script skeleton
- “Next questions to ask the data” list

## Guardrails
- Don’t assume tools are installed; offer alternatives (pure Python fallback).
- Avoid commands that mutate data unless explicitly requested.
- If data may be sensitive, recommend redaction/sampling before sharing in prompts.
