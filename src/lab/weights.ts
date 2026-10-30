/**
 * Weight math (ADR 0005). For each Axis value: `(keeps + 1) / (keeps + tosses + 2)`, then
 * a floor so no value falls below 5% of its Axis's total weight.
 */
import type { Axes } from "./sampling.ts";
import type { Meta } from "./storage.ts";

/** Axis name → Axis value → its current Weight, both in rules-file order. */
export type Weights = Record<string, Record<string, number>>;

/** The smallest share of its Axis's total weight any value may have. */
export const FLOOR_SHARE = 0.05;

export function computeWeights(axes: Axes, history: readonly Meta[]): Weights {
  const weights: Weights = {};
  for (const [axis, values] of Object.entries(axes)) {
    const raw = values.map((value) => {
      let keeps = 0;
      let tosses = 0;
      for (const { brief, verdict } of history) {
        if (brief[axis] !== value) continue;
        if (verdict === "keep") keeps++;
        if (verdict === "toss") tosses++;
      }
      return (keeps + 1) / (keeps + tosses + 2);
    });
    const floored = applyFloor(raw);
    weights[axis] = Object.fromEntries(values.map((value, i) => [value, floored[i]!]));
  }
  return weights;
}

/**
 * Raise the lowest weights, just enough that each is `FLOOR_SHARE` of the new total; the
 * others keep their value. Raising one value grows the total, which can push another under
 * the floor, so this repeats until nothing is under it. An Axis with more than 20 values
 * can't give each one 5%, so there the floor is an even share instead.
 */
function applyFloor(raw: readonly number[]): number[] {
  const share = Math.min(FLOOR_SHARE, 1 / raw.length);
  const raised = new Set<number>();
  let floor = 0;
  for (;;) {
    const rest = raw.reduce((sum, w, i) => (raised.has(i) ? sum : sum + w), 0);
    floor = (share * rest) / (1 - share * raised.size);
    const under = raw.flatMap((w, i) => (!raised.has(i) && w < floor * (1 - 1e-12) ? [i] : []));
    if (under.length === 0) break;
    for (const i of under) raised.add(i);
  }
  return raw.map((w, i) => (raised.has(i) ? floor : w));
}
