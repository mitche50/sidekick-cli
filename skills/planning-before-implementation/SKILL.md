---
name: planning-before-implementation
description: Produces a plan-first workflow (plan, review, execute, re-plan) for complex tasks before making code changes.
---

## Goal
Increase success rate on complex work by separating **planning**, **review**, and **execution**. The plan becomes an artifact the user can validate before implementation begins.

## Use when
- The task is multi-step, ambiguous, or spans multiple files/systems.
- The user asks for architecture, refactors, migrations, or “do this end-to-end”.
- The user is using multiple models/sessions and wants a routing strategy.

## Procedure
1. **Generate an explicit plan**
   - Break into phases (Discovery → Design → Implementation → Verification → Rollout).
   - Identify risks, unknowns, and what information is needed.
   - Define acceptance criteria (what “done” means).

2. **Create a “review prompt”**
   - Provide a prompt the user can send to a second model/session:
     - “Review this plan like a senior engineer; find missing steps, risks, and alternatives.”

3. **Refine the plan**
   - Integrate review feedback.
   - If tradeoffs exist, present 2–3 options with pros/cons and a recommendation.

4. **Only then produce implementation steps**
   - Provide step-by-step changes with checkpoints.
   - Include how to verify after each checkpoint (tests, lint, smoke checks).

5. **When errors occur: re-plan**
   - If a step fails, update the plan to incorporate the new constraint and proceed.

## Output format
- **Plan** (phases + steps)
- **Assumptions & unknowns**
- **Risks & mitigations**
- **Acceptance criteria**
- **Review prompt** (copy/paste)
- **Execution checklist** (ordered, testable checkpoints)

## Review prompt template
```text
You are reviewing an implementation plan as a senior engineer.
1) Identify missing steps, unclear assumptions, and likely failure modes.
2) Suggest improvements to sequencing and verification.
3) Offer alternative approaches if appropriate.
Return: (a) annotated plan, (b) top 5 risks, (c) recommended changes.
```

## Guardrails
- Don’t start writing code until the plan is explicit enough to execute.
- If critical inputs are missing, state assumptions and list the questions that block execution.
- Prefer test-first verification checkpoints over “trust me” changes.
