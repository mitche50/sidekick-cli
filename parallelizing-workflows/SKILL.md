---
name: parallelizing-workflows
description: Guides parallel coding using git worktrees or clones and isolated LLM sessions per task to reduce context bleed.
---

## Goal
Set up 3–5 isolated working contexts (git worktrees or clones) and map each to a dedicated LLM session/model so multiple tasks can move forward in parallel without context pollution.

## Use when
- The user wants to tackle multiple tasks concurrently in the same repo.
- The user mentions *worktrees*, *parallel branches*, *multiple sessions*, *multi-agent*, or *context contamination*.
- The user wants a repeatable structure for “task A / task B / task C” work.

## Inputs to confirm (ask only if missing)
- Repo path + default branch (e.g., `main`).
- Task list and short slugs (e.g., `bug-login`, `feat-billing`).
- Preferred isolation method: `git worktree` (recommended) vs separate clones.
- Router entrypoint (examples: `ollama run`, LM Studio CLI, custom router script).

## Procedure
1. **Choose structure**
   - Prefer worktrees when tasks share the same repo history and dependencies.
   - Prefer clones when tasks need radically different dependency sets or build tooling.

2. **Create one worktree per task**
   - Each task gets: a branch, a worktree directory, and its own terminal tab/session.

3. **Create launch commands per session**
   - Provide copy/paste-ready shell aliases or scripts that:
     - `cd` into the task worktree
     - launch the chosen model/session
     - (optional) export a session tag for logs/notes

4. **Reserve an “analysis” session**
   - A dedicated session focused on logs, diffs, and review.
   - It should not directly edit files; it produces findings and recommendations.

5. **Coordination conventions (lightweight)**
   - Each session writes notes to `notes/<task>/status.md`:
     - goal, assumptions, current blockers, next steps
   - Each session outputs a patch/diff or a PR-ready commit.

## Output format
- **Section 1: Proposed directory layout**
- **Section 2: Commands** (single code block; safe-by-default)
- **Section 3: Router/session mapping** (task → model/session)
- **Section 4: Rollback** (how to remove worktrees/branches safely)
- **Section 5: Next-step checklist**

## Template: worktrees + aliases
```bash
# Example layout:
#   ~/proj/
#     wt-main/
#     wt-bug-login/
#     wt-feat-billing/
#     wt-docs/

cd ~/proj/wt-main

# Create worktrees (edit names as needed)
git worktree add ../wt-bug-login -b bug-login
git worktree add ../wt-feat-billing -b feat-billing
git worktree add ../wt-docs -b docs

# Optional: simple aliases for launching sessions
alias llm_bug_login='cd ~/proj/wt-bug-login && ollama run mistral'
alias llm_feat_billing='cd ~/proj/wt-feat-billing && ollama run llama3'
alias llm_docs='cd ~/proj/wt-docs && ollama run mistral'
alias llm_review='cd ~/proj/wt-main && ollama run llama3'
```

## Guardrails
- Never include destructive commands (e.g., `rm -rf`, deleting branches) unless explicitly requested.
- If repo state is unknown, recommend `git status` + `git worktree list` before changes.
- Prefer short, memorable task slugs; avoid reusing a slug for different work.
