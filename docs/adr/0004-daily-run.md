# ADR 0004: Daily run as a Claude desktop scheduled task, with a Smoke check

**Status:** Accepted, 2026-10-30

## Context

Every day, something has to pick 3 Briefs, have Claude write them, and make sure the results work. LLM-written WebGL often renders a blank screen or throws errors.

Options considered: a Claude desktop scheduled task, a cloud routine (it would have to commit to GitHub, and you'd pull), or a local cron job calling the Anthropic API (you'd manage an API key and pay per call).

## Decision

- A **Claude desktop scheduled task** (local cron) runs a fresh Claude Code session in this repo **every day at 7:00 AM local time**. It uses the user's subscription and needs no API key.
- The generation instructions live in the repo as a project skill, `.claude/skills/generate-batch/SKILL.md`. The scheduled task's prompt is one line that runs `/generate-batch` in this repo, so the logic is version-controlled and can also be run by hand.
- **The run commits; the user doesn't.** At the start it commits any pending Verdicts (`lab: verdicts`), and at the end it commits the batch (`lab: batch YYYY-MM-DD`). It never pushes.
- Each Interaction must pass a **Smoke check** in a headless browser: it loads with no console errors, draws a non-blank frame, and survives a simulated pointer move.
- If a check fails, Claude gets one retry with the error included. If the retry also fails, the run drops that Interaction and generates a replacement from a new Brief.

## Consequences

- The run only happens while the Claude desktop app is open. A missed run happens the next time the app opens, so no day is lost.
- You only ever see Interactions that pass the Smoke check.
- The Smoke check needs a headless browser (e.g. Playwright) as a dev dependency.
