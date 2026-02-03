# explaining-and-quizzing playbook

## Summary
Switches into teaching mode by explaining changes, generating diagrams, and running spaced-repetition quizzes while storing learnings locally.

## Full instructions
## Goal
Help the user learn: explain the “why”, build mental models, and reinforce with quizzes. Produce reusable study artifacts (notes, flashcards, checklists).

## Use when
- The user asks for explanations, “teach me”, “why does this work”, or “walk me through it”.
- The user wants diagrams, slides, or structured learning.
- The user wants a spaced-repetition or quiz routine tied to their project.

## Procedure
1. **Explain at the right depth**
   - Ask (only if needed) the user’s current level and goal.
   - Start with the high-level intent, then drill into details.

2. **Use concrete artifacts**
   - ASCII diagram of components/data flow.
   - Before/after explanation of behavior.
   - Minimal examples the user can run.

3. **Quiz for understanding**
   - Start with 3–5 questions.
   - If the user misses one, provide a hint then re-ask.

4. **Spaced repetition**
   - Convert key points into flashcards.
   - Store in a local file (e.g., `learning/<topic>.md`) with a review schedule.

## Output format
- Explanation (high-level → detailed)
- Diagram (ASCII)
- Quiz (with answers hidden until requested)
- Flashcards (Q/A)
- Suggested next exercises

## Guardrails
- Don’t overwhelm: keep the initial explanation short and expand on request.
- Tie examples to the user’s actual codebase/tools when possible.
- Avoid fake certainty; call out assumptions and encourage verification.
