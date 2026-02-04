---
name: delegating-subagents
description: Decomposes complex tasks into parallel subagent work across separate LLM sessions, then synthesizes results and runs a gatekeeper review.
---

## Goal
Handle complex work by splitting it into parallel subtasks (“subagents”) routed to separate sessions/models, then integrating outputs with a final review.

## Use when
- The task naturally splits (research vs implementation vs testing vs docs).
- The user wants multiple models working in parallel.
- The user needs a safety or security review step before merging.

## Procedure
1. **Decompose**
   - Identify 3–6 independent subtasks with clear deliverables.
   - Define interfaces between subtasks (inputs/outputs).

2. **Assign sessions/models**
   - Match model strengths to subtask type:
     - fast model: scanning, summarizing, listing files
     - strong model: architecture, tricky bugs, code synthesis

3. **Write subagent prompts**
   - Each prompt includes:
     - goal
     - constraints
     - what to read
     - expected output format
     - timebox/stop condition (e.g., “if blocked, ask for X”)

4. **Synthesize**
   - Combine results into a single coherent plan/patch.
   - Resolve conflicts; call out disagreements.

5. **Gatekeeper review**
   - Run a final pass focused on:
     - security, privacy, unsafe commands
     - correctness and edge cases
     - regression risk and test coverage

## Output format
- Subtask list (with deliverables)
- Session/model mapping
- Copy/paste subagent prompts
- Synthesis checklist
- Gatekeeper checklist

## Gatekeeper checklist (example)
- Any secrets exposed? Any risky shell commands?
- Input validation, authz/authn, injection risks
- Error handling + logging
- Tests updated/added; negative cases covered

## Guardrails
- Keep subagents isolated: no shared “memory” assumptions.
- Prefer merging via diffs/patches and explicit notes.
- If the user has only one model/session, simulate subagents sequentially with clear boundaries.
