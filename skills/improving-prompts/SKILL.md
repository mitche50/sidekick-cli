---
name: improving-prompts
description: Iteratively improves prompts and specs using critique, stricter acceptance criteria, and rewrite cycles to raise output quality.
---

## Goal
Improve output quality from local models by making prompts more precise and by running structured critique/rewrite loops.

## Use when
- The user says results are “meh”, “off”, “too verbose”, “not rigorous”, or “wrong”.
- The user wants a better spec, better review prompt, or stronger guardrails.
- The user asks for “quiz me”, “prove it”, or “be ruthless”.

## Procedure
1. **Clarify the target**
   - What artifact is needed (patch, plan, report, script, explanation)?
   - What constraints matter (performance, readability, safety, style)?

2. **Write acceptance criteria**
   - 5–10 checkable bullets (“must”, “must not”).
   - Include verification (tests, commands, invariants).

3. **Produce a “critic prompt”**
   - A separate prompt to evaluate the work against criteria.

4. **Rewrite**
   - Incorporate critique.
   - Prefer a clean rewrite over incremental patching when quality is low.

5. **Lock in the improved prompt**
   - Output the final “prompt template” the user can reuse.

## Output format
- Acceptance criteria
- Primary prompt (copy/paste)
- Critic prompt (copy/paste)
- Optional: variant prompts for smaller/weaker models

## Critic prompt template
```text
Critique the output against the acceptance criteria.
Be specific: quote problematic parts, name missing requirements, and propose concrete fixes.
If criteria are underspecified, propose improved criteria.
```

## Guardrails
- Avoid vague advice (“be better”); always propose concrete edits.
- Don’t expand scope. Improve clarity and rigor within the same goals.
