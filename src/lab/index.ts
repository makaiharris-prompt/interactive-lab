/**
 * The lab core: everything the lab knows, behind one small interface.
 *
 * It works on a lab directory (`rules.yaml` plus the `interactions/` folders)
 * and hides rules parsing, sampling and file layout from its callers
 * (the lab CLI, the Gallery's dev server, tests).
 */
import { seededRandom } from "./random.ts";
import { readRules } from "./rules.ts";
import { briefKey, ordinaryBrief, unusedBrief, wildcardBrief } from "./sampling.ts";
import { Storage } from "./storage.ts";

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

export interface NewInteraction {
  brief: Brief;
  wildcard: boolean;
  /** A short title, written by Claude. */
  title: string;
  /** The Daily batch's date, `YYYY-MM-DD`. */
  date: string;
  /** The Interaction itself: one self-contained HTML file. */
  html: string;
}

/** An Interaction with no Verdict yet. */
export interface InboxItem {
  id: string;
  brief: Brief;
  wildcard: boolean;
  title: string;
  date: string;
}

export const BATCH_SIZE = 3;

/** Pick briefs never reuses a Brief from an Interaction dated less than this many days before the batch. */
export const REPEAT_WINDOW_DAYS = 30;

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export interface Lab {
  /**
   * Pick the Briefs for a Daily batch: 3 different Briefs, exactly one flagged as the Wildcard.
   * The Wildcard favors Axis values with few past Briefs. No Brief repeats one from the last
   * 30 days; throws if every possible Brief was used in that window.
   */
  pickBriefs(options: PickBriefsOptions): PickedBrief[];
  /** Store a new Interaction and its metadata. It lands in the Inbox. */
  registerInteraction(interaction: NewInteraction): { id: string };
  /** Interactions without a Verdict, oldest first. */
  inbox(): InboxItem[];
  /** An Interaction's HTML, or `undefined` if there is none (unknown id, or Tossed). */
  interactionHtml(id: string): string | undefined;
}

export function openLab(labDir: string): Lab {
  const storage = new Storage(labDir);

  return {
    pickBriefs({ date, seed }) {
      const { axes } = readRules(labDir);
      const random = seededRandom(`${date}\u0000${seed}`);
      const wildcardIndex = Math.floor(random() * BATCH_SIZE);
      const history = storage.ids().map((id) => storage.readMeta(id));
      const pastBriefs = history.map((past) => past.brief);

      // Briefs used in the last 30 days (ADR 0005), plus the ones already in this batch.
      const used = new Set(
        history
          .filter((past) => daysBetween(past.date, date) < REPEAT_WINDOW_DAYS)
          .map((past) => briefKey(axes, past.brief)),
      );

      return Array.from({ length: BATCH_SIZE }, (_, i) => {
        const wildcard = i === wildcardIndex;
        const sample = wildcard
          ? () => wildcardBrief(axes, pastBriefs, random)
          : () => ordinaryBrief(axes, random);
        const brief = unusedBrief(axes, sample, used, random);
        if (!brief) {
          throw new Error(
            `Every possible Brief was already used in the last ${REPEAT_WINDOW_DAYS} days; add Axis values to rules.yaml`,
          );
        }
        used.add(briefKey(axes, brief));
        return { brief, wildcard };
      });
    },

    registerInteraction({ brief, wildcard, title, date, html }) {
      const id = storage.create({ brief, wildcard, title, date, verdict: null, note: null }, html);
      return { id };
    },

    inbox() {
      return storage.ids().flatMap((id) => {
        const { brief, wildcard, title, date, verdict } = storage.readMeta(id);
        return verdict ? [] : [{ id, brief, wildcard, title, date }];
      });
    },

    interactionHtml(id) {
      return storage.readHtml(id);
    },
  };
}
