# Interaction Lab

A personal lab that generates new creative-engineering **Interactions** every day from a set of rules. It's a source of inspiration. The user keeps the ones they like, and over time the lab's output moves toward their taste.

Inspired by Emil Kowalski's "interaction lab" (x.com/emilkowalski/status/2115789995860517254).

## Glossary

**Interaction**
One self-contained piece of output: a single HTML file that shows one idea. It's either a *micro-interaction* (responds to user input such as hover, drag, scroll or cursor) or a *motion study* (animation only, no input). It's small enough to judge in about 10 seconds. The goal is innovative creative engineering, not UI-kit polish.

**Brief**
The short spec that one Interaction is written from, made by sampling one value from each Axis, e.g. `trigger: drag · element: card · feel: springy`. A deterministic picker makes the Brief, and Claude writes the code from it.

**Axis**
One dimension a Brief is sampled from (trigger, element, feel, …). Axes and their values live in `rules.yaml`, and you can edit them without touching code.

**Hard constraint**
A rule that every Interaction must follow regardless of its Brief (single file, works with mouse and touch, respects `prefers-reduced-motion`, …). Hard constraints also live in `rules.yaml`.

**Style guide**
The overall aesthetic every Interaction aims for (currently minimal, modern and dark, riffing on a React Bits component picked by the `inspiration` Axis). It's prose in `rules.yaml` passed to Claude as written. Unlike a Hard constraint it's a matter of taste, so the Smoke check doesn't enforce it.

**Daily batch**
The 3 Interactions generated on one day.

**Verdict**
The user's judgement of an Interaction: **Keep** or **Toss**, plus an optional free-text **Note** ("love the easing, hate the color"). Verdicts are the signal the lab learns preferences from.

**Wildcard**
The one Interaction in each Daily batch that ignores preference weights and favors rarely tried Axis values. It keeps taste from narrowing, and the Gallery labels it.

**Weights**
How likely each Axis value is to be picked. Keeps raise a value's weight and Tosses lower it.

**Taste context**
Recent Keeps and Notes, passed to Claude while it writes an Interaction. Weights steer *what* gets made, and Taste context steers *how* it's made.

**Inbox**
Interactions that don't have a Verdict yet. They count as neutral and never affect Weights.

**Kept collection**
Every Interaction with a Keep Verdict.

**Smoke check**
An automatic headless-browser test that every Interaction must pass before you see it: no console errors, a non-blank frame, and survives a simulated pointer move.

**Gallery**
The local web app where the user browses Daily batches, gives Verdicts and looks through the Kept collection.

## Initial Axes

| Axis | Values |
|---|---|
| trigger | hover · click · drag · scroll · cursor proximity · keyboard · idle (motion study) |
| subject | button · card · list · text/type · image · particles · grid · nav · abstract form |
| technique | canvas 2D · fragment shader · three.js scene · SDF · verlet/spring physics · flow field · particle system · DOM + CSS only |
| feel | springy · snappy · weighty · liquid · floaty · glitchy · tactile · eerie |

## Initial Hard constraints

- One self-contained `index.html`. The only external import allowed is a library from the `rules.yaml` allow-list (three.js to start), loaded through the Gallery's import map.
- Works with both mouse and touch.
- Respects `prefers-reduced-motion`.
- At most about 300 lines (raised from 200 to leave room for shaders and three.js setup).
- Must pass the Smoke check.

## Decisions

- [ADR 0001: Hybrid generation (deterministic picker + Claude)](docs/adr/0001-hybrid-generation.md)
- [ADR 0002: Single-file vanilla Interactions, canvas/WebGL/three.js allowed](docs/adr/0002-single-file-vanilla-interactions.md)
- [ADR 0003: Local gallery first](docs/adr/0003-local-gallery-first.md)
- [ADR 0004: Daily run as a Claude desktop scheduled task, with a Smoke check](docs/adr/0004-daily-run.md)
- [ADR 0005: Preference learning (Weights + Taste context + Wildcard)](docs/adr/0005-preference-learning.md)
- [ADR 0006: Git-tracked file storage and locally served libraries](docs/adr/0006-storage-and-libraries.md)
- [ADR 0007: Gallery UX](docs/adr/0007-gallery.md)
