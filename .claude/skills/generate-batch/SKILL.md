---
name: generate-batch
description: Make today's Daily batch for the Interaction Lab — commit pending Verdicts, write 3 Smoke-checked Interactions from picked Briefs, register them and commit the batch. Use for /generate-batch, the 7:00 AM scheduled run, or a request to generate a batch.
---

# Generate a Daily batch

You are the daily run (ADR 0004). You turn 3 Briefs into 3 Interactions that pass the Smoke check, then leave exactly two local commits: `lab: verdicts` (if any were pending) and `lab: batch YYYY-MM-DD`. Vocabulary is `GLOSSARY.md`'s. The run may be unattended: nobody is there to answer questions, so every decision below has a default. Follow the steps in order.

**Guardrail:** never run `git push`, and make no commits other than the two the lab CLI makes for you. Publishing is the user's choice.

All commands run from the repo root. `npm run --silent` keeps npm's banner out of the JSON.

## 1. Set up

1. Confirm you are at the repo root: `rules.yaml` and `package.json` exist. If `node_modules/` is missing, run `npm install`.
2. Fix the batch date once and use it everywhere: `DATE=$(date +%F)`. Pass `--date $DATE` to every lab command below, so a run crossing midnight stays one batch.
3. Clear old drafts: `rm -rf drafts && mkdir drafts`. (`drafts/` is gitignored scratch that belongs to this skill.)
4. Note any untracked Interaction folders (`git status --porcelain -- interactions/`, lines starting `??`). They are leftovers of an interrupted run. Leave them as they are and list them in the final report.

Done when `DATE` is set and `drafts/` is empty.

## 2. Commit pending Verdicts

```
npm run --silent lab -- commit-verdicts
```

It commits only Verdict changes (edited `meta.json`, Tossed `index.html`) as `lab: verdicts` and prints `{committed, files}`. `committed: false` means nothing was pending. Either is fine; continue.

## 3. Preflight the Smoke check

Prove the browser works before blaming any Interaction:

```
mkdir -p drafts/preflight && cp src/smoke-check/fixtures/works.html drafts/preflight/index.html
npm run --silent smoke-check -- drafts/preflight
```

Exit 0 → continue. Anything else → the environment is broken (often Chromium is missing: `npx playwright install chromium`). Stop here, write nothing else, and report the error output so the user can fix it.

## 4. Gather what you write from

```
npm run --silent lab -- pick-briefs --date $DATE
npm run --silent lab -- taste-context --date $DATE
```

and read `styleGuide`, `hardConstraints` and `libraries` in `rules.yaml`.

- `pick-briefs` prints 3 `{brief, wildcard}` objects, exactly one with `wildcard: true`. Number them slots 1–3 in the order printed. Keep a running list, **picked today**, of every Brief you are given this run; it starts with these 3.
- The Taste context's `about` field says how to use each part: lean into what Keep Notes praise, steer clear of what Toss Notes criticise, and give each Interaction an idea and a title that differ from everything in `recentTitles`.

Done when you hold 3 Briefs, the Taste context, the Style guide, the Hard constraints and the allow-list.

## 5. Make each slot (repeat for slots 1, 2, 3)

Each slot ends in exactly one of two states: **registered** (an id from step 5d) or **empty** (step 5c gave up). Work on one slot at a time.

### 5a. Write the Interaction

Write `drafts/<slot>/index.html` (e.g. `drafts/1/index.html`) and choose a title of 2–5 words. Build from the Brief: one value per Axis, e.g. `trigger: drag · subject: card · technique: SDF · feel: springy`. Every Axis value should be visible in the result: the trigger drives it, the subject is what you see, the technique is how it is drawn, the feel is how it moves, the look is its palette and surface, and the inspiration is the React Bits component whose core mechanic you riff on (make a new sibling of it, never a copy). Follow the Style guide in `rules.yaml` for every Interaction, the Wildcard included: it sets the overall aesthetic, and the Brief chooses within it. Where the Style guide and the Taste context's Notes disagree, the Notes win: they are the user's latest word. A `wildcard: true` Brief is the day's deliberate surprise: honour its odd combination fully.

Meet every Hard constraint in `rules.yaml`. What they mean in practice here:

- **One file.** Inline CSS and JS. The only imports are allow-listed libraries, by bare name in a module script: `<script type="module">import * as THREE from "three";</script>` (addons as `"three/addons/…"`). The Gallery and the Smoke check supply the import map, so the file carries none of its own and no CDN URL.
- **Mouse and touch:** use Pointer Events (`pointerdown/move/up`), plus `touch-action: none` on anything draggable.
- **Reduced motion:** check `matchMedia("(prefers-reduced-motion: reduce)")` and swap continuous motion for a calm or static version that still shows the idea.
- **Size:** about 300 lines at most.

What the Smoke check needs to pass (it loads the file at 800×600 inside an iframe sandboxed with `allow-scripts` only):

- **No console errors or uncaught exceptions**, while loading or after a pointer sweep. The sandbox has no same origin, so `localStorage`, `sessionStorage`, cookies and `alert` throw or fail: keep all state in memory.
- **A non-blank first frame** within half a second of load, *before any input*. Draw a visible, non-uniform idle state immediately (an idle pose, a gradient, resting particles): a single flat colour fails, even if hovering would light it up.
- **Fill the viewport** and handle `resize`, so the poster shows the whole piece.

### 5b. Smoke check it

```
npm run --silent smoke-check -- drafts/<slot>
```

It takes a few seconds, at most about 20. Run it with a 3-minute tool timeout. It prints `{pass, errors, poster}`:

- **Exit 0**: pass. `drafts/<slot>/poster.png` now exists. Go to 5d.
- **Exit 1**: fail. The `errors` say what broke and when (`while loading`, `blank frame`, `after pointer move`). `timed out` means the page hung: an endless loop or long blocking work on the main thread.
- **Exit 2, or no result within 3 minutes** (stop the command): also a fail, since the preflight proved the browser works. Use the stderr text, or "the Smoke check never finished", as the error.

### 5c. Retry once, then replace

Each Brief gets **two attempts**:

1. After a first fail, rewrite `drafts/<slot>/index.html` to fix the reported errors (same Brief, same or better title) and run 5b again.
2. After a second fail, drop this Brief and pick a replacement that samples like it and avoids everything already picked today:

   ```
   npm run --silent lab -- pick-replacement --date $DATE [--wildcard] \
     --exclude '<picked-today Brief 1 JSON>' --exclude '<picked-today Brief 2 JSON>' ...
   ```

   Pass `--wildcard` exactly when the dropped Brief was the Wildcard, so the batch keeps exactly one. Pass one `--exclude` per Brief in **picked today** (originals and earlier replacements, including those already registered). Add the printed Brief to **picked today**, then start this slot again at 5a with a fresh idea for the new Brief (delete `drafts/<slot>/` first).

Replacements are capped so an unattended run always ends (ADR 0004, amendment):

- **An ordinary slot** gets at most 2 replacements: 3 Briefs, 6 attempts.
- **The Wildcard slot** gets at most 5 replacements: 6 Briefs, 12 attempts. Every one is a Wildcard replacement (`--wildcard`), so the batch keeps its Wildcard unless all 6 fail.

If the last Brief a slot may have fails too, or `pick-replacement` says no Brief is left, leave the slot **empty**, keep its drafts for the report, and move on to the next slot. Never fill an empty slot any other way: an ordinary slot is never refilled with a Wildcard, nor the Wildcard slot with an ordinary Brief.

### 5d. Register it

```
npm run --silent lab -- register --date $DATE \
  --brief '<the Brief JSON exactly as picked>' --title "<title>" \
  --html drafts/<slot>/index.html --poster drafts/<slot>/poster.png [--wildcard]
```

Pass `--wildcard` exactly when the Brief came with `wildcard: true`. The Brief JSON goes in single quotes, unchanged; keep the title free of `"`, `$` and backticks. It prints `{id}` (e.g. `2026-10-30-a`): the Interaction folder now holds `index.html`, `meta.json` and `poster.png`. Record the id.

Step 5 is done when every slot is registered or empty.

## 6. Commit the batch

If no slot was registered, skip to step 7. Otherwise, with one `--id` per registered Interaction:

```
npm run --silent lab -- commit-batch --date $DATE --id <id1> --id <id2> --id <id3>
```

It checks each folder has `index.html`, `meta.json` and `poster.png` dated `$DATE`, then commits exactly those folders as `lab: batch $DATE` and prints `{committed, files}`. Leftover folders, drafts and anything else you touched stay out of the commit.

Done when `git log -2 --format=%s` shows `lab: batch $DATE` on top (with `lab: verdicts` below it if step 2 committed).

## 7. Report

End with a short report. If any slot is empty, the batch is **short**: the report's very first line must say so, in capitals, before anything else, e.g.

```
SHORT BATCH: 2 of 3 Interactions registered. NO WILDCARD TODAY (slot 2 failed 6 Wildcard Briefs).
```

Say `NO WILDCARD TODAY` whenever the Wildcard slot is the empty one. A full batch has no such line. Then:

- each Interaction: id, title, its Brief on one line, and `(Wildcard)` on the Wildcard;
- every retry and replacement: which Brief, and the Smoke check errors that caused it;
- any empty slot, with its last errors (its drafts stay in `drafts/<slot>/`);
- the commits made (`git log --oneline -2`), and any leftover folders from step 1.

The run is complete with the batch committed locally; it stays unpushed.
