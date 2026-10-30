/**
 * How a single Brief is sampled. There are two samplers, kept apart on purpose:
 *
 * - `ordinaryBrief`: the non-Wildcard Briefs. Uniform for now; it will follow Weights (ADR 0005).
 * - `wildcardBrief`: ignores Weights and favors Axis values with few past Briefs (ADR 0005).
 *
 * Neither sampler knows about repeat avoidance: `unusedBrief` wraps either one and
 * rejects Briefs that are already used.
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

/** Identifies a Brief by its values on the current Axes, so identical Briefs share a key. */
export function briefKey(axes: Axes, brief: Brief): string {
  return JSON.stringify(Object.keys(axes).map((axis) => brief[axis] ?? null));
}

const ATTEMPTS = 1000;

/**
 * Draw from `sample` until it gives a Brief whose key is not in `used`. If that keeps
 * failing (nearly every Brief is used), pick uniformly among the unused ones instead.
 * `undefined` means every possible Brief is used.
 */
export function unusedBrief(
  axes: Axes,
  sample: () => Brief,
  used: ReadonlySet<string>,
  random: Random,
): Brief | undefined {
  for (let i = 0; i < ATTEMPTS; i++) {
    const brief = sample();
    if (!used.has(briefKey(axes, brief))) return brief;
  }
  const unused = allBriefs(axes).filter((brief) => !used.has(briefKey(axes, brief)));
  return unused.length === 0 ? undefined : pickOne(unused, random);
}

function allBriefs(axes: Axes): Brief[] {
  return Object.entries(axes).reduce<Brief[]>(
    (briefs, [axis, values]) => briefs.flatMap((brief) => values.map((value) => ({ ...brief, [axis]: value }))),
    [{}],
  );
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
