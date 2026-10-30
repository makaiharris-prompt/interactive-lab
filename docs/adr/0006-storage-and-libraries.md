# ADR 0006: Git-tracked file storage and locally served libraries

**Status:** Accepted, 2026-10-30

## Decision

**Storage.** Each Interaction gets its own folder in git:

```
interactions/2026-10-30-a/
  index.html   # the Interaction
  meta.json    # Brief, wildcard flag, Verdict, Note, date
```

- The Gallery writes Verdicts to `meta.json` through a small dev-server endpoint.
- **Toss** deletes `index.html` but keeps `meta.json`, because the learning needs it.
- **A Keep can be undone later:** un-keeping turns it into a Toss. **A Toss is final** (its HTML is gone, though git history still has it).
- The Smoke check also saves a `poster.png` thumbnail into the folder.
- No state is stored anywhere except the repo.

**Libraries.** At first the only allowed library is three.js. It's **pinned to one version and served locally** by the Gallery through an import map, never from a CDN. The allowed libraries are listed in `rules.yaml`.

## Consequences

- The repo's history doubles as a record of how your taste changed.
- Interactions work offline, and an upstream release can't break them.
- To add a library (GSAP, a physics engine, …), add it to `rules.yaml` and vendor it.
