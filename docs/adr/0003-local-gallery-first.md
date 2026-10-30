# ADR 0003: Local gallery first

**Status:** Accepted, 2026-10-30

## Context

The Gallery could be local-only, hosted, or both. Hosting raises questions about where Verdicts are stored, auth, and a deploy pipeline, and those shouldn't block the core loop (generate → judge → learn).

## Decision

The Gallery runs locally from this repo (`npm run dev`). Its output stays static-buildable, so it can be hosted later without a rewrite.

## Consequences

- You view it on your Mac only; no phone access for now.
- Verdicts can be written straight to files in the repo.
