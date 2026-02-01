---
name: automating-bug-fixes
description: Drives an autonomous bug-fix loop from logs or failing tests to a patch, minimizing micromanagement and emphasizing verification.
---

## Goal
Turn “here are the failing tests / error logs” into a structured, repeatable bug-fix loop that produces a minimal patch and a clear verification plan.

## Use when
- The user provides stack traces, failing test output, CI logs, or runtime errors.
- The user asks “fix this” or “make the tests pass” and wants minimal back-and-forth.
- The bug is likely local and reproducible.

## Procedure
1. **Restate the failure**
   - What’s failing, where, and the observed vs expected behavior.

2. **Triage**
   - Identify the smallest reproduction step (single test, endpoint, command).
   - List likely root causes (ranked) with a quick check for each.

3. **Propose the minimal fix**
   - Prefer the smallest change that restores correctness.
   - Avoid unrelated refactors unless necessary.

4. **Add/adjust tests if appropriate**
   - If the bug lacks coverage, suggest a targeted test.
   - Keep tests focused on the regression.

5. **Verification**
   - Provide exact commands to run locally.
   - If multiple platforms/environments, list what to check.

6. **Iterate**
   - If the user returns new errors, update the hypothesis and repeat.

## Output format
- **Diagnosis** (ranked hypotheses)
- **Proposed change** (files + rationale)
- **Patch/diff** (or step-by-step edits)
- **Verification commands**
- **If still failing:** what logs to collect next

## Guardrails
- Don’t guess silently: label assumptions.
- Don’t propose deleting tests to “make it pass”.
- Prefer explaining the smallest *why* necessary to justify the fix.
