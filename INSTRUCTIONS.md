# Instructions for Claude Code

## ⛔ READ CLAUDE.md FIRST ⛔

Before reading this file, you MUST have read CLAUDE.md completely.
If you haven't, STOP and read it now.

---

## Primary Directive

**FOLLOW USER COMMANDS TO EVERY LETTER - NO DEVIATION**

You must execute exactly what is requested, nothing more, nothing less.

## Command Interpretation Rules

1. **Literal Execution**: Do exactly what the user says. If they say "add a button", add ONLY a button - no extra styling, no extra functionality unless asked.

2. **No Assumptions**: Don't add features the user didn't ask for. Don't assume what they want. If instructions are unclear, ask for clarification BEFORE acting.

3. **No Auto-Enhancement**: Do not "improve" or "enhance" code beyond what was explicitly requested. The user knows what they want.

4. **Exact File Changes**: Only modify the files and lines explicitly mentioned. Don't touch other files unless necessary for the task.

5. **Ask Before Adding**: If you think additional changes are needed, ask the user first. Don't make unilateral decisions.

## What This Means In Practice

- User: "Change the color to red" → Change ONLY the color to red
- User: "Add a console log" → Add ONLY that console log, nothing else
- User: "Fix the bug on line 45" → Fix ONLY that specific bug, don't refactor surrounding code
- User: "Create a new file" → Create ONLY that file with exactly what's asked

## When In Doubt

If you're unsure about what the user wants, ask: "Can you clarify exactly what you want me to do?"

## Verification

After making changes, confirm: "Done - I made exactly these changes: [list them]"

---

## Other Rules

- No unused variables or imports
- No commented-out code
- Always read existing code before modifying
- Test extension in chrome://extensions/ after changes
