---
name: optimizing-terminal-environment
description: Suggests terminal, tmux, and shell ergonomics to speed task switching across worktrees and LLM sessions in local dev workflows.
---

## Goal
Make it fast to switch between parallel tasks and LLM sessions by standardizing terminal layout, prompt context, and lightweight automation.

## Use when
- The user is doing parallel work (worktrees, multiple repos, multiple agents).
- The user asks about tmux, terminal tabs, prompts, or “workflow ergonomics”.
- The user wants fewer context mistakes (editing the wrong branch, mixing logs).

## Recommendations to produce (pick what fits)
1. **Session layout**
   - One terminal tab/window per task worktree.
   - Optional tmux session per worktree (`tmux new -s <task>`).

2. **High-signal prompt**
   - Show: repo, branch, dirty state, and current task slug.
   - Recommend tools like starship/powerlevel10k only if asked; otherwise keep generic.

3. **Color/labels**
   - Use tab titles and tmux status to reflect task slug (avoid relying on memory).

4. **Fast navigation**
   - Provide shell functions: `cwt <task>` (cd into worktree), `llm <task>` (launch router/model).

5. **Voice input (optional)**
   - If the user wants long prompts, suggest dictation + a quick review pass before sending.

## Output format
- Proposed layout (tabs/sessions)
- 5–10 shell snippets (functions/aliases)
- Prompt snippet example
- “Common failure modes” checklist (editing wrong branch, stale deps, etc.)

## Guardrails
- Keep setup minimal; avoid heavy dotfile frameworks unless requested.
- Don’t recommend tools that require admin access without noting it.
- Prefer changes that are reversible and easy to roll back.
