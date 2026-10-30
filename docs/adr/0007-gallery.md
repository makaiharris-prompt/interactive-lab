# ADR 0007: Gallery UX

**Status:** Accepted, 2026-10-30

## Decision

The Gallery is built with Vite and vanilla TypeScript, and has three views:

- **Today / Inbox:** each Interaction opens large and live in a sandboxed iframe, with its Brief shown underneath. Wildcards are labeled.
- **Kept:** a grid of `poster.png` thumbnails. An Interaction plays live on hover or when opened.
- **Brief stats:** the current Weights for each Axis, so you can see your taste changing.

Keyboard shortcuts: `K` keep · `T` toss · `N` note · `←/→` move between Interactions. Every Interaction has a **Copy source** button.

## Why thumbnails

Browsers cap active WebGL contexts at roughly 16. A grid of live three.js scenes would hit that limit and lose contexts, so only the Interaction you're looking at runs live.
