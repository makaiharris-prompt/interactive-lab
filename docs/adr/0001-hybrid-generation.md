# ADR 0001: Hybrid generation (deterministic picker + Claude)

**Status:** Accepted, 2026-10-30

## Context

The lab has to produce new, varied Interactions every day and move toward the user's taste over time. Two simpler options were rejected:

- **A procedural generator** that combines hand-written building blocks gets repetitive quickly and can't invent new techniques.
- **Claude alone**, with an open prompt, drifts toward the same few clichés and gives preferences no clear place to apply.

## Decision

Generation happens in two steps:

1. A deterministic **picker** samples a **Brief** from the Axes in `rules.yaml`. Preferences will influence this sampling (mechanism still to be decided).
2. **Claude** writes the Interaction from the Brief, following the Hard constraints.

## Consequences

- Variety is controlled by the rules, not by how the prompt is worded.
- Each Interaction records the Brief it came from, so each Verdict can be credited back to specific Axis values.
- Generation needs Claude access at run time. How it's triggered is still to be decided.
