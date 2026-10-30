/**
 * How a single Brief is sampled. There are two samplers, kept apart on purpose:
 *
 * - `ordinaryBrief`: the non-Wildcard Briefs. Uniform for now; it will follow Weights (ADR 0005).
 * - `wildcardBrief`: ignores Weights and favors Axis values with few past Briefs (ADR 0005).
 *
 * Neither knows about repeat avoidance; the caller rejects Briefs it can't use.
 */
import type { Brief } from "./index.ts";
import { pickOne, pickWeighted, type Random } from "./random.ts";

/** Axis name → its values. */
export type Axes = Record<string, string[]>;

export function ordinaryBrief(axes: Axes, random: Random): Brief {
  const brief: Brief = {};
  for (const [axis, values] of Object.entries(axes)) brief[axis] = pickOne(values, random);
  return brief;
}

/**
 * A value tried `n` times before has weight `1 / (n + 1)`: a value never tried is
 * several times likelier than one tried a handful of times, but none is ruled out.
 */
export function wildcardBrief(axes: Axes, history: readonly Brief[], random: Random): Brief {
  const brief: Brief = {};
  for (const [axis, values] of Object.entries(axes)) {
    const tries = new Map<string, number>();
    for (const past of history) {
      const value = past[axis];
      if (value !== undefined) tries.set(value, (tries.get(value) ?? 0) + 1);
    }
    brief[axis] = pickWeighted(values, (value) => 1 / ((tries.get(value) ?? 0) + 1), random);
  }
  return brief;
}
