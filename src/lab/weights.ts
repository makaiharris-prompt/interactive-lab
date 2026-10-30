/**
 * Weight math (ADR 0005). For each Axis value: `(keeps + 1) / (keeps + tosses + 2)`, then
 * a floor so no value falls below 5% of its Axis's total weight.
 */
import type { Axes } from "./rules.ts";
import type { Meta } from "./storage.ts";

/** Axis name → Axis value → its current Weight, both in rules-file order. */
export type Weights = Record<string, Record<string, number>>;

/** One Axis in the Brief stats. */
export interface AxisStats {
  /**
   * The smallest share of the Axis's total weight any value may have: 5%, or an even share
   * on an Axis with more than 20 values.
   */
  floorShare: number;
  /** Axis value → its Weight, its share of the Axis's total, and whether the floor raised it. */
  values: Record<string, { weight: number; share: number; atFloor: boolean }>;
}

/** Axis name → its stats, in rules-file order: what the Gallery's Brief stats view shows. */
export type BriefStats = Record<string, AxisStats>;

/** The smallest share of its Axis's total weight any value may have. */
export const FLOOR_SHARE = 0.05;

export function computeWeights(axes: Axes, history: readonly Meta[]): Weights {
  const stats = computeBriefStats(axes, history);
  return Object.fromEntries(
    Object.entries(stats).map(([axis, { values }]) => [
      axis,
      Object.fromEntries(Object.entries(values).map(([value, { weight }]) => [value, weight])),
    ]),
  );
}

export function computeBriefStats(axes: Axes, history: readonly Meta[]): BriefStats {
  const stats: BriefStats = {};
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
    const { weights, raised, share } = applyFloor(raw);
    const total = weights.reduce((sum, w) => sum + w, 0);
    stats[axis] = {
      floorShare: share,
      values: Object.fromEntries(
        values.map((value, i) => [value, { weight: weights[i]!, share: weights[i]! / total, atFloor: raised.has(i) }]),
      ),
    };
  }
  return stats;
}

/**
 * Raise the lowest weights, just enough that each is `FLOOR_SHARE` of the new total; the
 * others keep their value. Raising one value grows the total, which can push another under
 * the floor, so this repeats until nothing is under it. An Axis with more than 20 values
 * can't give each one 5%, so there the floor is an even share instead.
 */
function applyFloor(raw: readonly number[]): { weights: number[]; raised: ReadonlySet<number>; share: number } {
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
  return { weights: raw.map((w, i) => (raised.has(i) ? floor : w)), raised, share };
}
