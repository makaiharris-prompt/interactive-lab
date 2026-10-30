/**
 * Weight math (ADR 0005). For each Axis value: `(keeps + 1) / (keeps + tosses + 2)`.
 */
import type { Axes } from "./sampling.ts";
import type { Meta } from "./storage.ts";

/** Axis name → Axis value → its current Weight, both in rules-file order. */
export type Weights = Record<string, Record<string, number>>;

export function computeWeights(axes: Axes, history: readonly Meta[]): Weights {
  const weights: Weights = {};
  for (const [axis, values] of Object.entries(axes)) {
    weights[axis] = {};
    for (const value of values) {
      let keeps = 0;
      let tosses = 0;
      for (const { brief, verdict } of history) {
        if (brief[axis] !== value) continue;
        if (verdict === "keep") keeps++;
        if (verdict === "toss") tosses++;
      }
      weights[axis][value] = (keeps + 1) / (keeps + tosses + 2);
    }
  }
  return weights;
}
