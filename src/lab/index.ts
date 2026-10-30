/**
 * The lab core: everything the lab knows, behind one small interface.
 *
 * It works on a lab directory (`rules.yaml` plus the `interactions/` folders)
 * and hides rules parsing, sampling and file layout from its callers
 * (the lab CLI, the Gallery's dev server, tests).
 */
import { seededRandom, pickOne } from "./random.ts";
import { readRules } from "./rules.ts";

/** One value per Axis, keyed by Axis name, e.g. `{ trigger: "drag", feel: "springy" }`. */
export type Brief = Record<string, string>;

export interface PickedBrief {
  brief: Brief;
  wildcard: boolean;
}

export interface PickBriefsOptions {
  /** The Daily batch's date, `YYYY-MM-DD`. */
  date: string;
  /** Randomness from the caller; the same date and seed always give the same Briefs. */
  seed: string | number;
}

export const BATCH_SIZE = 3;

export interface Lab {
  /** Pick the Briefs for a Daily batch: 3 Briefs, exactly one flagged as the Wildcard. */
  pickBriefs(options: PickBriefsOptions): PickedBrief[];
}

export function openLab(labDir: string): Lab {
  return {
    pickBriefs({ date, seed }) {
      const { axes } = readRules(labDir);
      const random = seededRandom(`${date}\u0000${seed}`);
      const wildcardIndex = Math.floor(random() * BATCH_SIZE);

      return Array.from({ length: BATCH_SIZE }, (_, i) => {
        const brief: Brief = {};
        for (const [axis, values] of Object.entries(axes)) brief[axis] = pickOne(values, random);
        return { brief, wildcard: i === wildcardIndex };
      });
    },
  };
}
