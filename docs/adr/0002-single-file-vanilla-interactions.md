# ADR 0002: Single-file vanilla Interactions, canvas/WebGL/three.js allowed

**Status:** Accepted, 2026-10-30

## Context

The goal is innovative creative engineering, and most of the interesting work will use canvas 2D, raw WebGL/shaders or three.js. Interactions also need to be easy to copy into other projects, and one broken Interaction must not break the Gallery.

## Decision

- Each Interaction is a **single HTML file** with plain HTML, CSS and JS, and no build step or framework.
- Canvas 2D, WebGL and three.js are allowed. (How three.js and any other libraries are loaded is still to be decided.)
- The Gallery shows each Interaction in a **sandboxed iframe**.

## Consequences

- An Interaction can be copied anywhere just by copying its file.
- No React or component-library output, by design.
