# ADR 0005: Preference learning (Weights + Taste context + Wildcard)

**Status:** Accepted, 2026-10-30

## Context

The lab's output should move toward the user's taste, but without narrowing until everything it makes looks the same.

## Decision

- **Weights:** every Axis value has a weight. A Keep raises the weight of each value in its Brief, and a Toss lowers it. The picker samples Briefs using these weights.
- **Taste context:** recent Keeps and Notes are passed to Claude while it writes, so feedback like "love the easing, hate the color" affects *how* things are built.
- **Wildcard:** 1 of the 3 Interactions each day ignores Weights and favors rarely tried Axis values. The Gallery labels it.
- **Inbox items count as neutral:** an Interaction without a Verdict doesn't affect anything, and generation continues whether or not the user has reviewed.

## Details

- **Weight formula:** for each Axis value, `(keeps + 1) / (keeps + tosses + 2)`. A value with no Verdicts sits at 0.5, so a single Toss can't eliminate it.
- **Floor:** no value drops below 5% of the total weight on its Axis.
- Wildcard Verdicts update Weights like any other Verdict.
- **Taste context size:** the Briefs and Notes of the last 10 Keeps, plus the Notes of the last 10 Tosses (Tosses without a Note are skipped).
- **Repeat avoidance:** Claude sees the titles of the last 30 days of Interactions, and the picker never reuses an identical Brief within 30 days.
- Only the latest Verdict counts (see ADR 0006 for changing a Verdict).

## Consequences

- Weights only learn at the level of Axis values. Anything finer has to come through Taste context.
- Every Interaction must store its Brief and whether it was the Wildcard, so Verdicts can be credited correctly.
