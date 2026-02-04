---
name: maintaining-local-knowledge-base
description: Captures lessons learned into a persistent, version-controlled knowledge base and suggests how to inject it into prompts.
---

## Goal
Reduce repeat mistakes by turning “what we learned” into a lightweight, searchable, git-tracked knowledge base that can be injected into future prompts.

## Use when
- The user wants a system to remember project rules, fixes, conventions, and gotchas.
- A debugging session uncovers a recurring failure mode.
- The user says “we keep forgetting this” or “write this down for next time”.

## Knowledge base structure (recommended)
- `llm-kb/`
  - `README.md` (how to use)
  - `rules.md` (durable conventions)
  - `gotchas.md` (sharp edges, common failures)
  - `decisions.md` (ADRs/lightweight)
  - `prompts/` (prompt templates)
  - `projects/<project>/` (project-specific notes)

## Procedure
1. **Extract “durable” vs “situational” learnings**
   - Durable: conventions, commands, invariants, safety checks.
   - Situational: one-off details (keep in project notes).

2. **Write updates as small, atomic entries**
   - Include: date, context, symptom, fix, verification.
   - Keep entries short and skimmable.

3. **Propose prompt-injection strategy**
   - Default: prepend `rules.md` + `gotchas.md` to routed prompts.
   - Optional: select sections by keyword (router can grep and inject only relevant blocks).

4. **Keep it under version control**
   - Commit KB updates like code: small commits, meaningful messages.

## Output format
- Suggested KB file layout
- The exact entry to append (ready to paste)
- A short “injection snippet” showing how a router could include KB text
- A maintenance checklist (how to keep it clean)

## KB entry template
```markdown
### 2026-02-01 — <short title>
**Context:** <repo/module>
**Symptom:** <what broke>
**Root cause:** <why>
**Fix:** <what changed>
**Verify:** <commands/tests>
**Notes:** <any gotchas>
```

## Guardrails
- Do not store secrets (API keys, tokens, credentials).
- Prefer “how to verify” over long explanations.
- If the KB becomes large, recommend splitting into smaller files and injecting selectively.
